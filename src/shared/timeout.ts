const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

export const resolveTimeout = (timeoutMs?: number): number => {
    if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs)) {
        return DEFAULT_TIMEOUT_MS;
    }

    const clamped = Math.trunc(timeoutMs);
    if (clamped < MIN_TIMEOUT_MS) return MIN_TIMEOUT_MS;
    if (clamped > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
    return clamped;
};
