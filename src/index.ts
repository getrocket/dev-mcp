#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { logInfo, logError } from './shared/logger.js';
import { registerPostgresTools, closePostgres } from './tools/postgres.js';
import { registerClickhouseTools, closeClickhouse } from './tools/clickhouse.js';
import { registerGraphqlTools } from './tools/graphql.js';
import { registerBigqueryTools, closeBigquery } from './tools/bigquery.js';

const config = loadConfig();

const server = new McpServer({
    name: 'dev-mcp',
    version: '0.1.0',
});

const registeredBackends: string[] = [];

const registerTools = async () => {
    if (config.postgres) {
        registerPostgresTools(server, config);
        registeredBackends.push('postgres');
    }

    if (config.clickhouse) {
        registerClickhouseTools(server, config);
        registeredBackends.push('clickhouse');
    }

    if (config.graphql) {
        registerGraphqlTools(server, config);
        registeredBackends.push('graphql');
    }

    if (config.bigquery) {
        await registerBigqueryTools(server, config);
        registeredBackends.push('bigquery');
    }

    if (registeredBackends.length === 0) {
        logError('startup', new Error(
            'No backends configured. Set at least one of: POSTGRES_CONNECTION_STRING, CLICKHOUSE_URL, GRAPHQL_ENDPOINT, GOOGLE_APPLICATION_CREDENTIALS'
        ));
        process.exit(1);
    }

    logInfo(`Registered backends: ${registeredBackends.join(', ')}`);
};

let shuttingDown = false;

const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo(`Shutdown initiated (code ${code})`);

    try { await server.close(); } catch (e) { logError('Error closing server', e); }
    try { await closePostgres(); } catch (e) { logError('Error closing postgres', e); }
    try { await closeClickhouse(); } catch (e) { logError('Error closing clickhouse', e); }
    try { await closeBigquery(); } catch (e) { logError('Error closing bigquery', e); }

    process.exit(code);
};

const start = async () => {
    logInfo(`Starting dev-mcp server (env: ${config.environment})`);

    await registerTools();

    const transport = new StdioServerTransport();
    transport.onclose = () => { logInfo('Transport closed'); void shutdown(0); };
    transport.onerror = (error: Error) => { logError('Transport error', error); void shutdown(1); };

    await server.connect(transport);
    logInfo('Server connected to stdio transport');
};

start().catch((error) => {
    logError('Server startup error', error);
    process.exit(1);
});

process.on('SIGINT', () => { logInfo('SIGINT received'); void shutdown(0); });
process.on('SIGTERM', () => { logInfo('SIGTERM received'); void shutdown(0); });
