import { cleanupOldFiles, writeResultFile } from './result-file.js';

const MAX_RESULT_BYTES = 50 * 1024; // 50 KB
const MAX_TABLE_ROWS = 200;
const MAX_CELL_WIDTH = 80;

interface FormatOptions {
    toolName: string;
    metadata: Record<string, string | number>;
    rows: Array<Record<string, unknown>>;
    responseFormat?: 'table' | 'json';
    rawResult?: unknown;
}

const truncateCell = (value: unknown): string => {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.length > MAX_CELL_WIDTH) {
        return str.slice(0, MAX_CELL_WIDTH - 1) + '\u2026';
    }
    return str;
};

const buildMarkdownTable = (rows: Array<Record<string, unknown>>, maxRows: number): string => {
    if (rows.length === 0) return '_No rows returned._';

    const columns = Object.keys(rows[0]);
    const displayRows = rows.slice(0, maxRows);

    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = displayRows.map(
        (row) => `| ${columns.map((col) => truncateCell(row[col])).join(' | ')} |`
    );

    const lines = [header, separator, ...body];

    if (rows.length > maxRows) {
        lines.push(``, `_\u2026 and ${rows.length - maxRows} more rows (see full results file)_`);
    }

    return lines.join('\n');
};

const buildMetadataHeader = (metadata: Record<string, string | number>): string => {
    return Object.entries(metadata)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join(' | ');
};

export const formatToolResponse = (options: FormatOptions) => {
    cleanupOldFiles();

    const { toolName, metadata, rows, responseFormat = 'table', rawResult } = options;
    const resultPayload = rawResult ?? { metadata, rows };
    const serialized = JSON.stringify(resultPayload);
    const overflows = serialized.length > MAX_RESULT_BYTES;

    const metaHeader = buildMetadataHeader(metadata);

    if (responseFormat === 'json') {
        if (overflows) {
            const filepath = writeResultFile(toolName, resultPayload);
            return {
                content: [{ type: 'text' as const, text: `${metaHeader}\n\nResult too large (${serialized.length} bytes). Full JSON written to:\n\`${filepath}\`` }],
                isError: false,
            };
        }
        return {
            content: [{ type: 'text' as const, text: `${metaHeader}\n\n\`\`\`json\n${serialized}\n\`\`\`` }],
            isError: false,
        };
    }

    // Table format
    const table = buildMarkdownTable(rows, MAX_TABLE_ROWS);

    if (overflows) {
        const filepath = writeResultFile(toolName, resultPayload);
        return {
            content: [{
                type: 'text' as const,
                text: `${metaHeader}\n\n${table}\n\nFull results (${rows.length} rows, ${serialized.length} bytes) written to:\n\`${filepath}\``
            }],
            isError: false,
        };
    }

    return {
        content: [{ type: 'text' as const, text: `${metaHeader}\n\n${table}` }],
        isError: false,
    };
};

export const formatErrorResponse = (backendName: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
        content: [{ type: 'text' as const, text: `${backendName} error: ${message}` }],
        isError: true,
    };
};
