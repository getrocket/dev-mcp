import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const RESULTS_DIR = join(tmpdir(), 'dev-mcp-results');
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

const ensureDir = () => {
    mkdirSync(RESULTS_DIR, { recursive: true });
};

export const writeResultFile = (toolName: string, data: unknown): string => {
    ensureDir();
    const ts = Date.now();
    const hash = createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 8);
    const filename = `${toolName}-${ts}-${hash}.json`;
    const filepath = join(RESULTS_DIR, filename);
    writeFileSync(filepath, JSON.stringify(data, null, 2));
    return filepath;
};

export const cleanupOldFiles = () => {
    try {
        ensureDir();
        const now = Date.now();
        for (const file of readdirSync(RESULTS_DIR)) {
            const filepath = join(RESULTS_DIR, file);
            try {
                const stat = statSync(filepath);
                if (now - stat.mtimeMs > MAX_AGE_MS) {
                    unlinkSync(filepath);
                }
            } catch {
                // ignore individual file errors
            }
        }
    } catch {
        // ignore cleanup errors
    }
};
