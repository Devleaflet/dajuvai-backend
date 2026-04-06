import { Request, Response, NextFunction } from "express";
import { responseCacheStore } from "../utils/responseCacheStore";

type InvalidationRule = {
    matchPrefix: string;
    invalidatePrefixes: string[];
    keyPrefix?: string;
};

const defaultKeyPrefix = "resp:";

function deleteGetCacheByPathPrefix(pathPrefix: string, keyPrefix: string) {
    const keyStart = `${keyPrefix}GET:${pathPrefix}`;
    responseCacheStore.deleteByKeyPrefix(keyStart);
}

export function cacheInvalidationMiddleware(rules: InvalidationRule[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const method = req.method.toUpperCase();
        if (method === "GET" || method === "HEAD") return next();

        res.on("finish", () => {
            if (res.statusCode >= 400) return;

            const path = req.originalUrl.split("?")[0];
            for (const rule of rules) {
                if (!path.startsWith(rule.matchPrefix)) continue;

                const keyPrefix = rule.keyPrefix ?? defaultKeyPrefix;
                for (const prefix of rule.invalidatePrefixes) {
                    deleteGetCacheByPathPrefix(prefix, keyPrefix);
                }
            }
        });

        return next();
    };
}

