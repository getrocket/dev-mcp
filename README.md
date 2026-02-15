# @getrocket/dev-mcp

Consolidated MCP server for Rocket dev tools. Provides read-only access to PostgreSQL, ClickHouse, GraphQL (Hasura), and BigQuery from any MCP client.

## Install

Requires a `.npmrc` with GitHub Packages auth:

```
@getrocket:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_...
```

Then:

```bash
npx @getrocket/dev-mcp@latest
```

## MCP client config

```json
{
    "dev-mcp": {
        "command": "npx",
        "args": ["@getrocket/dev-mcp@latest"],
        "env": {
            "POSTGRES_CONNECTION_STRING": "...",
            "CLICKHOUSE_URL": "...",
            "GRAPHQL_ENDPOINT": "...",
            "GRAPHQL_ADMIN_SECRET": "...",
            "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
        }
    }
}
```

Only include the env vars for the backends you need. At least one backend must be configured or the server will refuse to start.

## Environment variables

| Env var | Tool enabled | Required |
|---|---|---|
| `POSTGRES_CONNECTION_STRING` | `sql_query` | For Postgres |
| `CLICKHOUSE_URL` | `clickhouse_query` | For ClickHouse |
| `GRAPHQL_ENDPOINT` | `graphql_query` | For GraphQL |
| `GRAPHQL_ADMIN_SECRET` | — | Optional (Hasura auth) |
| `GRAPHQL_ROLE` | — | Optional (Hasura role) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `bigquery_query` | For BigQuery |
| `MCP_SERVER_ENV` | — | Optional (default: `dev`) |

## Tools

### `sql_query`

Execute read-only SQL against PostgreSQL.

| Param | Type | Description |
|---|---|---|
| `sql` | string | SQL query to execute |
| `timeoutMs` | number? | Timeout in ms (1000–300000, default 30000) |
| `responseFormat` | `"table"` \| `"json"`? | Output format (default: `table`) |

### `clickhouse_query`

Execute read-only ClickHouse queries.

| Param | Type | Description |
|---|---|---|
| `query` | string | ClickHouse SQL query |
| `format` | `"JSON"` \| `"JSONEachRow"` \| `"JSONCompact"`? | ClickHouse output format (default: `JSON`) |
| `timeoutMs` | number? | Timeout in ms (1000–300000, default 30000) |
| `responseFormat` | `"table"` \| `"json"`? | Output format (default: `table`) |

### `graphql_query`

Execute GraphQL queries against Hasura.

| Param | Type | Description |
|---|---|---|
| `query` | string | GraphQL query or mutation |
| `operationName` | string? | Operation name |
| `variables` | object? | Query variables |
| `timeoutMs` | number? | Timeout in ms (1000–300000, default 30000) |

### `bigquery_query`

Execute read-only SQL against Google BigQuery. Requires a read-only service account — the server refuses to start if write permissions are detected.

| Param | Type | Description |
|---|---|---|
| `query` | string | BigQuery SQL query |
| `timeoutMs` | number? | Timeout in ms (1000–300000, default 30000) |
| `responseFormat` | `"table"` \| `"json"`? | Output format (default: `table`) |

## Response format

Results are returned as a single content block with a metadata header and markdown table. If the serialized result exceeds 50 KB, full results are written to a temp file (`$TMPDIR/dev-mcp-results/`) and the response includes the file path for on-demand reading. Temp files older than 1 hour are cleaned up automatically.

## Development

```bash
yarn install
yarn build
yarn dev  # run with tsx
```

## Publishing

Publishes automatically via GitHub Actions when a version tag is pushed:

```bash
# bump version in package.json, then:
git tag v0.2.0
git push origin v0.2.0
```
