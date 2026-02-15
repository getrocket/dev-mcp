import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import { logInfo, logError } from '../shared/logger.js';
import { resolveTimeout } from '../shared/timeout.js';
import { formatErrorResponse } from '../shared/formatter.js';

const graphqlQueryInputShape = {
    query: z.string().min(1, 'GraphQL query must be provided').describe('The GraphQL query or mutation to execute.'),
    operationName: z.string().min(1).optional().describe('Operation name (if the document contains multiple operations)'),
    variables: z.record(z.string(), z.unknown()).optional().describe('Variables to pass to the query'),
    timeoutMs: z.number().int().positive().optional().describe('Request timeout in milliseconds (1000–300000, default 30000)'),
};

const graphqlQueryInputSchema = z.object(graphqlQueryInputShape);

export const registerGraphqlTools = (server: McpServer, config: AppConfig) => {
    const gqlConfig = config.graphql!;

    const buildHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-client-name': `${config.environment}-mcp-graphql`,
        };
        if (gqlConfig.adminSecret) {
            headers['x-hasura-admin-secret'] = gqlConfig.adminSecret;
        }
        if (gqlConfig.role) {
            headers['x-hasura-role'] = gqlConfig.role;
        }
        return headers;
    };

    server.registerTool(
        'graphql_query',
        {
            title: 'GraphQL Query (Hasura)',
            description: `Execute GraphQL queries against the Hasura endpoint.

Example:
  query { users(limit: 10) { id name email } }
  query GetUser($id: uuid!) { users_by_pk(id: $id) { id name } }

Notes:
  - Pass variables as a JSON object in the "variables" field
  - Use operationName when your document has multiple operations
  - Queries are automatically timed out (default 30s, max 5min)`,
            inputSchema: graphqlQueryInputShape,
        },
        async (input) => {
            const parsed = graphqlQueryInputSchema.parse(input);
            const timeout = resolveTimeout(parsed.timeoutMs);
            logInfo(`graphql_query invoked (query length: ${parsed.query.length}, timeout: ${timeout}ms)`);

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(gqlConfig.endpoint, {
                    method: 'POST',
                    headers: buildHeaders(),
                    body: JSON.stringify({
                        query: parsed.query,
                        operationName: parsed.operationName,
                        variables: parsed.variables,
                    }),
                    signal: controller.signal,
                });

                const responseText = await response.text();
                let payload: Record<string, unknown> = {};

                if (responseText) {
                    try {
                        payload = JSON.parse(responseText) as Record<string, unknown>;
                    } catch {
                        throw new Error(`Unable to parse GraphQL response as JSON`);
                    }
                }

                if (!response.ok) {
                    throw new Error(`GraphQL request failed (${response.status}): ${response.statusText || 'Unknown error'}`);
                }

                const hasErrors = Array.isArray(payload.errors) && payload.errors.length > 0;
                logInfo(`graphql_query responded (hasErrors: ${hasErrors}, timeout: ${timeout}ms)`);

                // GraphQL responses are tree-shaped, not tabular — return as JSON
                const resultJson = JSON.stringify({
                    data: payload.data,
                    errors: payload.errors,
                    timeoutMs: timeout,
                }, null, 2);

                const statusPrefix = hasErrors
                    ? `**Errors:** ${(payload.errors as unknown[]).length} | **Timeout:** ${timeout}ms\n\nGraphQL returned data with errors.`
                    : `**Timeout:** ${timeout}ms`;

                return {
                    content: [{ type: 'text' as const, text: `${statusPrefix}\n\n\`\`\`json\n${resultJson}\n\`\`\`` }],
                    isError: hasErrors,
                };
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return formatErrorResponse('GraphQL', new Error(`Request aborted after ${timeout}ms`));
                }
                logError('graphql_query error', error);
                return formatErrorResponse('GraphQL', error);
            } finally {
                clearTimeout(timer);
            }
        }
    );
};
