export type CachedHttpResponse = {
    statusCode: number;
    body: string;
    contentType: string;
    expiresAt: number;
};

type ResponseCacheOptions = {
    maxEntries: number;
};

export class ResponseCacheStore {
    private cache = new Map<string, CachedHttpResponse>();
    private maxEntries: number;

    constructor(options: ResponseCacheOptions) {
        this.maxEntries = options.maxEntries;
    }

    get(key: string): CachedHttpResponse | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }

        // Refresh LRU-ish order
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry;
    }

    set(key: string, entry: Omit<CachedHttpResponse, "expiresAt">, ttlSeconds: number): void {
        const expiresAt = Date.now() + Math.max(0, ttlSeconds) * 1000;
        this.cache.set(key, { ...entry, expiresAt });

        while (this.cache.size > this.maxEntries) {
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (!oldestKey) break;
            this.cache.delete(oldestKey);
        }
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    deleteByKeyPrefix(prefix: string): number {
        let deleted = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                deleted++;
            }
        }
        return deleted;
    }

    deleteWhere(predicate: (key: string, entry: CachedHttpResponse) => boolean): number {
        let deleted = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (predicate(key, entry)) {
                this.cache.delete(key);
                deleted++;
            }
        }
        return deleted;
    }
}

export const responseCacheStore = new ResponseCacheStore({ maxEntries: 1000 });

