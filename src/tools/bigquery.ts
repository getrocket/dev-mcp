import { BigQuery } from '@google-cloud/bigquery';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import { logInfo, logError } from '../shared/logger.js';
import { resolveTimeout } from '../shared/timeout.js';
import { formatToolResponse, formatErrorResponse } from '../shared/formatter.js';

const bigqueryQueryInputShape = {
    query: z.string().min(1, 'BigQuery SQL query must be provided').describe('The BigQuery SQL query to execute (read-only).'),
    timeoutMs: z.number().int().positive().optional().describe('Query timeout in milliseconds (1000–300000, default 30000)'),
    responseFormat: z.enum(['table', 'json']).optional().default('table').describe('Response format: "table" (markdown, default) or "json" (raw)'),
};

const bigqueryQueryInputSchema = z.object(bigqueryQueryInputShape);

let bqClient: BigQuery | null = null;

export const registerBigqueryTools = async (server: McpServer, config: AppConfig) => {
    const bqConfig = config.bigquery!;

    bqClient = new BigQuery({
        keyFilename: bqConfig.credentialsPath,
    });

    await verifyReadOnly(bqClient);

    server.registerTool(
        'bigquery_query',
        {
            title: 'BigQuery Query',
            description: `Execute read-only SQL queries against Google BigQuery.

Example queries:
  SELECT * FROM \`project.dataset.table\` LIMIT 10;
  SELECT table_id, row_count FROM \`project.dataset.__TABLES__\`;
  SELECT column_name, data_type FROM \`project.dataset.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = 'my_table';

Notes:
  - Use backtick-quoted fully qualified table names: \`project.dataset.table\`
  - Use single quotes for string literals
  - Queries are automatically timed out (default 30s, max 5min)
  - Only SELECT queries are allowed (enforced server-side)`,
            inputSchema: bigqueryQueryInputShape,
        },
        async (input) => {
            const parsed = bigqueryQueryInputSchema.parse(input);
            const timeout = resolveTimeout(parsed.timeoutMs);
            logInfo(`bigquery_query invoked (query length: ${parsed.query.length}, timeout: ${timeout}ms)`);

            try {
                const [job] = await bqClient!.createQueryJob({
                    query: parsed.query,
                    useLegacySql: false,
                    jobTimeoutMs: timeout,
                    maximumBytesBilled: String(10 * 1024 * 1024 * 1024), // 10 GB safety cap
                });

                const [rows] = await job.getQueryResults();

                logInfo(`bigquery_query responded (${rows.length} rows)`);

                const [jobMetadata] = await job.getMetadata();
                const stats = jobMetadata?.statistics;
                const totalBytesProcessed = stats?.totalBytesProcessed ? Number(stats.totalBytesProcessed) : 0;

                return formatToolResponse({
                    toolName: 'bigquery_query',
                    metadata: {
                        Rows: rows.length,
                        Timeout: `${timeout}ms`,
                        'Bytes processed': totalBytesProcessed,
                    },
                    rows,
                    responseFormat: parsed.responseFormat,
                    rawResult: {
                        rows,
                        rowCount: rows.length,
                        bytesProcessed: totalBytesProcessed,
                        timeoutMs: timeout,
                    },
                });
            } catch (error) {
                logError('bigquery_query error', error);
                return formatErrorResponse('BigQuery', error);
            }
        }
    );
};

async function verifyReadOnly(client: BigQuery) {
    try {
        // Dry-run a CREATE TABLE to check if the account has write permissions.
        // If it validates without error, the account is too permissive.
        const [datasets] = await client.getDatasets({ maxResults: 1 });
        if (datasets.length === 0) {
            logInfo('BigQuery: no datasets found, skipping write permission check');
            return;
        }

        const datasetId = datasets[0].id;
        try {
            await client.createQueryJob({
                query: `CREATE TABLE \`${datasetId}.__dev_mcp_write_check__\` (id INT64)`,
                dryRun: true,
            });
            // If dry-run succeeds, the account can create tables
            throw new Error(
                `BigQuery service account has write permissions on dataset '${datasetId}'. ` +
                `Use a read-only service account for safety.`
            );
        } catch (error) {
            if (error instanceof Error && error.message.includes('write permissions')) {
                throw error;
            }
            // Permission denied on CREATE = read-only, which is what we want
            logInfo('BigQuery: service account verified as read-only');
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('write permissions')) {
            throw error;
        }
        logInfo(`BigQuery: could not verify permissions (${error instanceof Error ? error.message : String(error)}), proceeding`);
    }
}

export const closeBigquery = async () => {
    bqClient = null;
};
