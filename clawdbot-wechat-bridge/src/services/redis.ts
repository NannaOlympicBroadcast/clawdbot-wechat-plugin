import Redis from 'ioredis';
import { getConfig } from '../config.js';

/**
 * User binding structure
 */
export interface UserBinding {
    endpoint: string; // Clawdbot webhook URL
    token: string;    // Authentication token for the Clawdbot instance
    createdAt: number;
}

const BINDING_PREFIX = 'wechat:binding:';

let redisClient: Redis | null = null;

/**
 * Get Redis client singleton
 */
export function getRedis(): Redis {
    if (!redisClient) {
        const config = getConfig();
        redisClient = new Redis(config.redis.url);

        redisClient.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        redisClient.on('connect', () => {
            console.log('Connected to Redis');
        });
    }
    return redisClient;
}

/**
 * Set user binding (OpenID -> Clawdbot endpoint)
 */
export async function setBinding(
    openId: string,
    endpoint: string,
    token: string
): Promise<void> {
    const redis = getRedis();
    const binding: UserBinding = {
        endpoint,
        token,
        createdAt: Date.now(),
    };
    await redis.set(BINDING_PREFIX + openId, JSON.stringify(binding));
}

/**
 * Get user binding by OpenID
 */
export async function getBinding(openId: string): Promise<UserBinding | null> {
    const redis = getRedis();
    const data = await redis.get(BINDING_PREFIX + openId);
    if (!data) return null;
    try {
        return JSON.parse(data) as UserBinding;
    } catch {
        return null;
    }
}

/**
 * Delete user binding
 */
export async function deleteBinding(openId: string): Promise<boolean> {
    const redis = getRedis();
    const result = await redis.del(BINDING_PREFIX + openId);
    return result > 0;
}

/**
 * Check if user is bound
 */
export async function isBound(openId: string): Promise<boolean> {
    const redis = getRedis();
    return (await redis.exists(BINDING_PREFIX + openId)) > 0;
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
