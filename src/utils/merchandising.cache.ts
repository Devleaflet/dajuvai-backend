/**
 * In-process TTL cache for storefront placement reads (mega menu, category
 * grid, ...). These are the most-read rows in the system and rarely change.
 *
 * ponytail: process-local Map, not Redis. ioredis is a dependency but no
 * Redis server is configured anywhere in this repo (no docker-compose
 * service, no env var, no other caller). A single-process cache satisfies
 * "TTL + invalidate on write" without standing up infra nobody runs yet.
 * Swap for ioredis if this ever runs multi-instance.
 */
const TTL_MS = 5 * 60 * 1000;

interface Entry<T> {
    value: T;
    expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export const cacheGet = <T>(key: string): T | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value as T;
};

export const cacheSet = <T>(key: string, value: T): void => {
    store.set(key, { value, expiresAt: Date.now() + TTL_MS });
};

export const cacheInvalidate = (key: string): void => {
    store.delete(key);
};

export const _clearCacheForTest = (): void => store.clear();
