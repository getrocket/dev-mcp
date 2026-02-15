import { Pool } from 'pg';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import { logInfo, logError } from '../shared/logger.js';
import { resolveTimeout } from '../shared/timeout.js';
import { formatToolResponse, formatErrorResponse } from '../shared/formatter.js';

const sqlQueryInputShape = {
    sql: z.string().min(1, 'SQL query must be provided').describe('The SQL query to execute. Must be a read-only SELECT, EXPLAIN, or WITH query.'),
    timeoutMs: z.number().int().positive().optional().describe('Query timeout in milliseconds (1000–300000, default 30000)'),
    responseFormat: z.enum(['table', 'json']).optional().default('table').describe('Response format: "table" (markdown, default) or "json" (raw)'),
};

const sqlQueryInputSchema = z.object(sqlQueryInputShape);

let pool: Pool | null = null;

export const registerPostgresTools = (server: McpServer, config: AppConfig) => {
    const pgConfig = config.postgres!;

    pool = new Pool({
        application_name: `${config.environment}-mcp-postgres`,
        connectionString: pgConfig.connectionString,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
        max: 5,
    });

    server.registerTool(
        'sql_query',
        {
            title: 'SQL Query (PostgreSQL)',
            description: `Execute read-only SQL against the PostgreSQL database.

Example queries:
  SELECT * FROM users LIMIT 10;
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  EXPLAIN ANALYZE SELECT ...;

Notes:
  - Use single quotes for string literals: WHERE name = 'foo'
  - Use double quotes for identifiers with special chars: "column-name"
  - Queries are automatically timed out (default 30s, max 5min)`,
            inputSchema: sqlQueryInputShape,
        },
        async (input) => {
            const parsed = sqlQueryInputSchema.parse(input);
            const timeout = resolveTimeout(parsed.timeoutMs);
            logInfo(`sql_query invoked (SQL length: ${parsed.sql.length}, timeout: ${timeout}ms)`);

            const client = await pool!.connect();
            try {
                await client.query(`SET statement_timeout = ${timeout}`);
                const result = await client.query(parsed.sql);
                const rowCount = typeof result.rowCount === 'number' ? result.rowCount : result.rows.length;

                logInfo(`sql_query responded (${rowCount} rows)`);

                return formatToolResponse({
                    toolName: 'sql_query',
                    metadata: { Rows: rowCount, Timeout: `${timeout}ms` },
                    rows: result.rows,
                    responseFormat: parsed.responseFormat,
                    rawResult: {
                        fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
                        rowCount,
                        rows: result.rows,
                        timeoutMs: timeout,
                    },
                });
            } catch (error) {
                logError('sql_query error', error);
                return formatErrorResponse('PostgreSQL', error);
            } finally {
                try { await client.query('SET statement_timeout = DEFAULT'); } catch { /* noop */ }
                client.release();
            }
        }
    );
};

export const closePostgres = async () => {
    if (pool) {
        await pool.end();
        pool = null;
    }
};
