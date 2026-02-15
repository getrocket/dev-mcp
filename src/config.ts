export interface AppConfig {
    environment: string;
    postgres?: { connectionString: string };
    clickhouse?: { url: string };
    graphql?: { endpoint: string; adminSecret?: string; role?: string };
    bigquery?: { credentialsPath: string };
}

export const loadConfig = (): AppConfig => {
    const env = process.env;
    const config: AppConfig = {
        environment: env.MCP_SERVER_ENV || 'dev',
    };

    if (env.POSTGRES_CONNECTION_STRING) {
        config.postgres = { connectionString: env.POSTGRES_CONNECTION_STRING };
    }

    if (env.CLICKHOUSE_URL) {
        config.clickhouse = { url: env.CLICKHOUSE_URL };
    }

    if (env.GRAPHQL_ENDPOINT) {
        config.graphql = {
            endpoint: env.GRAPHQL_ENDPOINT,
            adminSecret: env.GRAPHQL_ADMIN_SECRET,
            role: env.GRAPHQL_ROLE,
        };
    }

    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
        config.bigquery = { credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS };
    }

    return config;
};
