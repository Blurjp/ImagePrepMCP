/**
 * Get or create Redis client
 * Falls back to in-memory Map if Redis is not available (for local dev)
 */
export declare function getRedisClient(): any;
/**
 * Device code storage operations
 */
export declare const deviceCodesStorage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    entries(): Promise<Array<[string, any]>>;
    keys(): Promise<string[]>;
};
/**
 * Session token storage operations
 */
export declare const sessionTokensStorage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    size(): Promise<number>;
    entries(): Promise<Array<[string, any]>>;
    getMostRecent(): Promise<{
        key: string;
        value: any;
    } | null>;
};
/**
 * Close Redis connection
 */
export declare function closeRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map