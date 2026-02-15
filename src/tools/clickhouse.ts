import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import { logInfo, logError } from '../shared/logger.js';
import { resolveTimeout } from '../shared/timeout.js';
import { formatToolResponse, formatErrorResponse } from '../shared/formatter.js';

const MS_TO_SECONDS = 1_000;

const clickhouseQueryInputShape = {
    query: z.string().min(1, 'ClickHouse query must be provided').describe('The ClickHouse SQL query to execute.'),
    format: z.enum(['JSON', 'JSONEachRow', 'JSONCompact']).optional().default('JSON').describe('ClickHouse output format (default: JSON)'),
    timeoutMs: z.number().int().positive().optional().describe('Query timeout in milliseconds (1000–300000, default 30000)'),
    responseFormat: z.enum(['table', 'json']).optional().default('table').describe('Response format: "table" (markdown, default) or "json" (raw)'),
};

const clickhouseQueryInputSchema = z.object(clickhouseQueryInputShape);

let sharedClient: ClickHouseClient | null = null;

export const registerClickhouseTools = (server: McpServer, config: AppConfig) => {
    const chConfig = config.clickhouse!;
    const DEFAULT_TIMEOUT = 30_000;

    const getClient = (): ClickHouseClient => {
        if (!sharedClient) {
            sharedClient = createClient({
                application: `${config.environment}-mcp-clickhouse`,
                request_timeout: DEFAULT_TIMEOUT,
                url: chConfig.url,
            });
        }
        return sharedClient;
    };

    server.registerTool(
        'clickhouse_query',
        {
            title: 'ClickHouse Query',
            description: `Execute read-only ClickHouse queries.

Example queries:
  SELECT * FROM system.tables WHERE database = 'default' LIMIT 10;
  SELECT count() FROM events WHERE date >= today() - 7;
  SELECT database, name, engine FROM system.tables;

Notes:
  - Use single quotes for string literals
  - Use backticks for identifiers: \`column-name\`
  - Supports JSON, JSONEachRow, and JSONCompact output formats
  - Queries are automatically timed out (default 30s, max 5min)`,
            inputSchema: clickhouseQueryInputShape,
        },
        async (input) => {
            const parsed = clickhouseQueryInputSchema.parse(input);
            const timeout = resolveTimeout(parsed.timeoutMs);
            logInfo(`clickhouse_query invoked (query length: ${parsed.query.length}, timeout: ${timeout}ms, format: ${parsed.format})`);

            const useSharedClient = timeout === DEFAULT_TIMEOUT;
            const client = useSharedClient
                ? getClient()
                : createClient({
                    application: `${config.environment}-mcp-clickhouse`,
                    request_timeout: timeout,
                    url: chConfig.url,
                });

            try {
                const resultSet = await client.query({
                    query: parsed.query,
                    format: parsed.format as any,
                    clickhouse_settings: {
                        max_execution_time: Math.floor(timeout / MS_TO_SECONDS),
                    },
                });

                const jsonResult = await resultSet.json();

                let data: Array<Record<string, unknown>>;
                let statistics: { elapsed: number; rows_read: number; bytes_read: number };

                if (Array.isArray(jsonResult)) {
                    data = jsonResult as Array<Record<string, unknown>>;
                    statistics = { elapsed: 0, rows_read: 0, bytes_read: 0 };
                } else {
                    const result = jsonResult as any;
                    data = result?.data || [];
                    statistics = result?.statistics || { elapsed: 0, rows_read: 0, bytes_read: 0 };
                }

                logInfo(`clickhouse_query responded (${data.length} rows)`);

                return formatToolResponse({
                    toolName: 'clickhouse_query',
                    metadata: {
                        Rows: data.length,
                        Timeout: `${timeout}ms`,
                        'Rows read': statistics.rows_read,
                        'Bytes read': statistics.bytes_read,
                        Elapsed: `${statistics.elapsed}s`,
                    },
                    rows: data,
                    responseFormat: parsed.responseFormat,
                    rawResult: { data, rows: data.length, statistics, timeoutMs: timeout },
                });
            } catch (error) {
                logError('clickhouse_query error', error);
                return formatErrorResponse('ClickHouse', error);
            } finally {
                if (!useSharedClient) {
                    await client.close();
                }
            }
        }
    );
};

export const closeClickhouse = async () => {
    if (sharedClient) {
        await sharedClient.close();
        sharedClient = null;
    }
};
