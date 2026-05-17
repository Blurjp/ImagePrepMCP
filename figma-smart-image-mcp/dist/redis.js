import Redis from "ioredis";
/**
 * Redis client for storing device codes and session tokens
 * Provides reliable multi-tenant storage across Railway containers
 */
let redisClient = null;
/**
 * Get or create Redis client
 * Falls back to in-memory Map if Redis is not available (for local dev)
 */
export function getRedisClient() {
    if (redisClient) {
        return redisClient;
    }
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_EXTERNAL_URL;
    if (!redisUrl) {
        console.error("[Redis] REDIS_URL not set, using in-memory fallback");
        return null;
    }
    try {
        // @ts-ignore - ioredis TypeScript definitions may have issues
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });
        redisClient.on("error", (err) => {
            console.error("[Redis] Error:", err);
        });
        redisClient.on("connect", () => {
            console.error("[Redis] Connected successfully");
        });
        return redisClient;
    }
    catch (error) {
        console.error("[Redis] Failed to create client:", error);
        return null;
    }
}
/**
 * In-memory fallback storage when Redis is not available
 */
const inMemoryDeviceCodes = new Map();
const inMemorySessionTokens = new Map();
const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TOKEN_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
function cleanupInMemoryMaps() {
    const now = Date.now();
    for (const [key, entry] of inMemoryDeviceCodes.entries()) {
        if (now > entry.expiresAt)
            inMemoryDeviceCodes.delete(key);
    }
    for (const [key, entry] of inMemorySessionTokens.entries()) {
        if (now > entry.expiresAt)
            inMemorySessionTokens.delete(key);
    }
}
setInterval(cleanupInMemoryMaps, CLEANUP_INTERVAL_MS);
/**
 * Device code storage operations
 */
/**
 * Wrap Redis operation with timeout to fail fast
 */
async function withRedisTimeout(promise, timeoutMs = 5000) {
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.error(`[Redis] Operation timed out after ${timeoutMs}ms`);
            resolve(null);
        }, timeoutMs);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
}
export const deviceCodesStorage = {
    async get(key) {
        const redis = getRedisClient();
        if (redis) {
            const raw = await withRedisTimeout(redis.get(`device:${key}`), 3000);
            return (raw && typeof raw === 'string') ? JSON.parse(raw) : null;
        }
        const entry = inMemoryDeviceCodes.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            inMemoryDeviceCodes.delete(key);
            return null;
        }
        return entry.value;
    },
    async set(key, value) {
        const redis = getRedisClient();
        if (redis) {
            await redis.setex(`device:${key}`, 600, JSON.stringify(value));
        }
        else {
            inMemoryDeviceCodes.set(key, { value, expiresAt: Date.now() + DEVICE_CODE_TTL_MS });
        }
    },
    async delete(key) {
        const redis = getRedisClient();
        if (redis) {
            await redis.del(`device:${key}`);
        }
        else {
            inMemoryDeviceCodes.delete(key);
        }
    },
    async entries() {
        const redis = getRedisClient();
        if (redis) {
            const keys = await redis.keys("device:*");
            const entries = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const cleanKey = key.substring(7);
                    entries.push([cleanKey, JSON.parse(data)]);
                }
            }
            return entries;
        }
        const now = Date.now();
        return Array.from(inMemoryDeviceCodes.entries())
            .filter(([, entry]) => now <= entry.expiresAt)
            .map(([k, entry]) => [k, entry.value]);
    },
    async keys() {
        const redis = getRedisClient();
        if (redis) {
            const keys = await redis.keys("device:*");
            return keys.map((k) => k.substring(7));
        }
        const now = Date.now();
        return Array.from(inMemoryDeviceCodes.entries())
            .filter(([, entry]) => now <= entry.expiresAt)
            .map(([k]) => k);
    },
    async clearAll() {
        const redis = getRedisClient();
        if (redis) {
            const keys = await redis.keys("device:*");
            if (keys.length === 0)
                return 0;
            return await redis.del(keys);
        }
        const count = inMemoryDeviceCodes.size;
        inMemoryDeviceCodes.clear();
        return count;
    }
};
/**
 * Session token storage operations
 */
export const sessionTokensStorage = {
    async get(key) {
        const redis = getRedisClient();
        if (redis) {
            const raw = await withRedisTimeout(redis.get(`session:${key}`), 3000);
            return (raw && typeof raw === 'string') ? JSON.parse(raw) : null;
        }
        const entry = inMemorySessionTokens.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            inMemorySessionTokens.delete(key);
            return null;
        }
        return entry.value;
    },
    async set(key, value) {
        const redis = getRedisClient();
        if (redis) {
            await redis.setex(`session:${key}`, 3600, JSON.stringify(value));
        }
        else {
            inMemorySessionTokens.set(key, { value, expiresAt: Date.now() + SESSION_TOKEN_TTL_MS });
        }
    },
    async delete(key) {
        const redis = getRedisClient();
        if (redis) {
            await redis.del(`session:${key}`);
        }
        else {
            inMemorySessionTokens.delete(key);
        }
    },
    async has(key) {
        const redis = getRedisClient();
        if (redis) {
            return (await redis.exists(`session:${key}`)) === 1;
        }
        const entry = inMemorySessionTokens.get(key);
        if (!entry)
            return false;
        if (Date.now() > entry.expiresAt) {
            inMemorySessionTokens.delete(key);
            return false;
        }
        return true;
    },
    async size() {
        const redis = getRedisClient();
        if (redis) {
            return await redis.dbsize();
        }
        return inMemorySessionTokens.size;
    },
    async entries() {
        const redis = getRedisClient();
        if (redis) {
            const keys = await withRedisTimeout(redis.keys("session:*"), 3000);
            if (!keys || !Array.isArray(keys)) {
                console.error("[Redis] Failed to get keys (timeout)");
                return [];
            }
            const entries = [];
            for (const key of keys) {
                const raw = await withRedisTimeout(redis.get(key), 2000);
                if (raw && typeof raw === 'string') {
                    const cleanKey = key.substring(8);
                    entries.push([cleanKey, JSON.parse(raw)]);
                }
            }
            return entries;
        }
        const now = Date.now();
        return Array.from(inMemorySessionTokens.entries())
            .filter(([, entry]) => now <= entry.expiresAt)
            .map(([k, entry]) => [k, entry.value]);
    },
    async clearAll() {
        const redis = getRedisClient();
        if (redis) {
            const keys = await redis.keys("session:*");
            if (keys.length === 0)
                return 0;
            return await redis.del(keys);
        }
        const count = inMemorySessionTokens.size;
        inMemorySessionTokens.clear();
        return count;
    },
    async getMostRecent() {
        console.log("[Redis] getMostRecent called");
        const entries = await this.entries();
        console.log(`[Redis] Found ${entries.length} session entries`);
        if (entries.length === 0) {
            console.log("[Redis] No entries found, returning null");
            return null;
        }
        // Find the most recent session by createdAt timestamp
        let mostRecent = entries[0];
        console.log(`[Redis] First entry: key=${mostRecent[0]}, hasToken=${!!mostRecent[1]?.token}, createdAt=${mostRecent[1]?.createdAt}`);
        for (const entry of entries) {
            if (entry[1].createdAt > mostRecent[1].createdAt) {
                mostRecent = entry;
            }
        }
        console.log(`[Redis] Most recent: key=${mostRecent[0]}, hasToken=${!!mostRecent[1]?.token}`);
        return { key: mostRecent[0], value: mostRecent[1] };
    }
};
/**
 * Close Redis connection
 */
export async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
//# sourceMappingURL=redis.js.map