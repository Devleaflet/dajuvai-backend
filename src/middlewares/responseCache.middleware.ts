import { Request, Response, NextFunction } from "express";
import { responseCacheStore } from "../utils/responseCacheStore";

type ResponseCacheOptions = {
    ttlSeconds: number;
    keyPrefix?: string;
};

const defaultKeyPrefix = "resp:";

function buildCacheKey(req: Request, keyPrefix: string) {
    return `${keyPrefix}${req.method}:${req.originalUrl}`;
}

export function responseCache(options: ResponseCacheOptions) {
    const ttlSeconds = options.ttlSeconds;
    const keyPrefix = options.keyPrefix ?? defaultKeyPrefix;

    return (req: Request, res: Response, next: NextFunction) => {
        if (req.method !== "GET") return next();

        // Safety: avoid caching personalized/authenticated responses. A session
        // arrives as a bearer header or as the `token` cookie; either one means
        // the response may be the caller's own and must not be shared.
        if (req.headers.authorization || req.cookies?.token) return next();

        // Debug escape hatch.
        if (req.query && (req.query as any).noCache === "1") return next();

        const key = buildCacheKey(req, keyPrefix);
        const cached = responseCacheStore.get(key);

        if (cached) {
            res.status(cached.statusCode);
            res.type(cached.contentType);
            res.send(cached.body);
            return;
        }

        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        res.json = (body: any) => {
            if (res.statusCode === 200) {
                responseCacheStore.set(
                    key,
                    {
                        statusCode: res.statusCode,
                        // Through the app's replacer, exactly as res.json()
                        // serialises it, so a cache hit never carries fields
                        // the live response stripped.
                        body: JSON.stringify(body, req.app.get("json replacer")),
                        contentType: "application/json",
                    },
                    ttlSeconds
                );
            }
            return originalJson(body);
        };

        res.send = (body: any) => {
            if (res.statusCode === 200 && typeof body === "string") {
                responseCacheStore.set(
                    key,
                    {
                        statusCode: res.statusCode,
                        body,
                        contentType: res.getHeader("content-type")?.toString() || "text/plain",
                    },
                    ttlSeconds
                );
            }
            return originalSend(body);
        };

        return next();
    };
}
