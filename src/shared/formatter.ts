import { cleanupOldFiles, writeResultFile } from './result-file.js';

const MAX_RESULT_BYTES = 50 * 1024; // 50 KB

interface FormatOptions {
    toolName: string;
    metadata: Record<string, string | number>;
    rows: Array<Record<string, unknown>>;
    responseFormat?: 'table' | 'json';
    rawResult?: unknown;
}

const cellToString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value);
};

const buildMarkdownTable = (rows: Array<Record<string, unknown>>): string => {
    if (rows.length === 0) return '_No rows returned._';

    const columns = Object.keys(rows[0]);

    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map(
        (row) => `| ${columns.map((col) => cellToString(row[col])).join(' | ')} |`
    );

    return [header, separator, ...body].join('\n');
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
    const table = buildMarkdownTable(rows);

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
