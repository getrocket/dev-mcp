export interface AppConfig {
    environment: string;
    postgres?: { connectionString: string };
    clickhouse?: { url: string };
    graphql?: { endpoint: string; adminSecret?: string; role?: string };
    bigquery?: { credentialsPath?: string; credentials?: Record<string, unknown> };
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
        const val = env.GOOGLE_APPLICATION_CREDENTIALS.trim();
        if (val.startsWith('{')) {
            try {
                config.bigquery = { credentials: JSON.parse(val) };
            } catch {
                throw new Error('GOOGLE_APPLICATION_CREDENTIALS looks like JSON but failed to parse');
            }
        } else {
            config.bigquery = { credentialsPath: val };
        }
    }

    return config;
};
