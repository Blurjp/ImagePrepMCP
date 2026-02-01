import Redis from "ioredis";

/**
 * Redis client for storing device codes and session tokens
 * Provides reliable multi-tenant storage across Railway containers
 */

let redisClient: any = null;

/**
 * Get or create Redis client
 * Falls back to in-memory Map if Redis is not available (for local dev)
 */
export function getRedisClient(): any {
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
    redisClient = new (Redis as any)(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("error", (err: Error) => {
      console.error("[Redis] Error:", err);
    });

    redisClient.on("connect", () => {
      console.error("[Redis] Connected successfully");
    });

    return redisClient;
  } catch (error) {
    console.error("[Redis] Failed to create client:", error);
    return null;
  }
}

/**
 * In-memory fallback storage when Redis is not available
 */
const inMemoryDeviceCodes: Map<string, any> = new Map();
const inMemorySessionTokens: Map<string, any> = new Map();

/**
 * Device code storage operations
 */
/**
 * Wrap Redis operation with timeout to fail fast
 */
async function withRedisTimeout<T>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      console.error(`[Redis] Operation timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]) as Promise<T | null>;
}

export const deviceCodesStorage = {
  async get(key: string): Promise<any> {
    const redis = getRedisClient();
    if (redis) {
      const data = await withRedisTimeout(redis.get(`device:${key}`), 3000);
      return data ? JSON.parse(data) : null;
    }
    return inMemoryDeviceCodes.get(key);
  },

  async set(key: string, value: any): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      // Set with 10 minute expiration (600 seconds)
      await redis.setex(`device:${key}`, 600, JSON.stringify(value));
    } else {
      inMemoryDeviceCodes.set(key, value);
    }
  },

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      await redis.del(`device:${key}`);
    } else {
      inMemoryDeviceCodes.delete(key);
    }
  },

  async entries(): Promise<Array<[string, any]>> {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys("device:*");
      const entries: Array<[string, any]> = [];
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          // Remove 'device:' prefix
          const cleanKey = key.substring(7);
          entries.push([cleanKey, JSON.parse(data)]);
        }
      }
      return entries;
    }
    return Array.from(inMemoryDeviceCodes.entries());
  },

  async keys(): Promise<string[]> {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys("device:*");
      // Remove 'device:' prefix
      return keys.map((k: string) => k.substring(7));
    }
    return Array.from(inMemoryDeviceCodes.keys());
  },

  async clearAll(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys("device:*");
      if (keys.length === 0) return 0;
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
  async get(key: string): Promise<any> {
    const redis = getRedisClient();
    if (redis) {
      const data = await withRedisTimeout(redis.get(`session:${key}`), 3000);
      return data ? JSON.parse(data) : null;
    }
    return inMemorySessionTokens.get(key);
  },

  async set(key: string, value: any): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      // Set with 1 hour expiration (3600 seconds)
      await redis.setex(`session:${key}`, 3600, JSON.stringify(value));
    } else {
      inMemorySessionTokens.set(key, value);
    }
  },

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      await redis.del(`session:${key}`);
    } else {
      inMemorySessionTokens.delete(key);
    }
  },

  async has(key: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      return (await redis.exists(`session:${key}`)) === 1;
    }
    return inMemorySessionTokens.has(key);
  },

  async size(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      return await redis.dbsize(); // Note: this returns total keys, not just session keys
    }
    return inMemorySessionTokens.size;
  },

  async entries(): Promise<Array<[string, any]>> {
    const redis = getRedisClient();
    if (redis) {
      const keys = await withRedisTimeout(redis.keys("session:*"), 3000);
      if (!keys) {
        console.error("[Redis] Failed to get keys (timeout)");
        return [];
      }
      const entries: Array<[string, any]> = [];
      for (const key of keys) {
        const data = await withRedisTimeout(redis.get(key), 2000);
        if (data) {
          // Remove 'session:' prefix
          const cleanKey = key.substring(8);
          entries.push([cleanKey, JSON.parse(data)]);
        }
      }
      return entries;
    }
    return Array.from(inMemorySessionTokens.entries());
  },

  async clearAll(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys("session:*");
      if (keys.length === 0) return 0;
      return await redis.del(keys);
    }
    const count = inMemorySessionTokens.size;
    inMemorySessionTokens.clear();
    return count;
  },

  async getMostRecent(): Promise<{ key: string; value: any } | null> {
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
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
