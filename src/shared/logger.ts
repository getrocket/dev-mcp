export const logInfo = (message: string) => {
    const timestamp = new Date().toISOString();
    process.stderr.write(`[INFO ${timestamp}] ${message}\n`);
};

export const logError = (prefix: string, error: unknown) => {
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`[ERROR] ${prefix}: ${details}\n`);
};
