import axios from 'axios';
import { getConfig } from '../config.js';
import { getRedis } from './redis.js';

const TOKEN_KEY = 'wechat:access_token';
const TOKEN_LOCK_KEY = 'wechat:access_token:lock';
const TOKEN_REFRESH_THRESHOLD = 600; // Refresh 10 minutes before expiry

interface TokenCache {
    accessToken: string;
    expiresAt: number; // Unix timestamp in seconds
}

/**
 * Get a valid WeChat access token (with auto-refresh)
 */
export async function getAccessToken(): Promise<string> {
    const redis = getRedis();
    const cached = await redis.get(TOKEN_KEY);

    if (cached) {
        const tokenData: TokenCache = JSON.parse(cached);
        const now = Math.floor(Date.now() / 1000);

        // Token is still valid with buffer time
        if (tokenData.expiresAt - TOKEN_REFRESH_THRESHOLD > now) {
            return tokenData.accessToken;
        }
    }

    // Need to refresh token
    return refreshAccessToken();
}

/**
 * Refresh the access token from WeChat API
 */
async function refreshAccessToken(): Promise<string> {
    const redis = getRedis();
    const config = getConfig();

    // Try to acquire lock to prevent multiple refreshes
    const lockAcquired = await redis.set(TOKEN_LOCK_KEY, '1', 'EX', 30, 'NX');

    if (!lockAcquired) {
        // Another process is refreshing, wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getAccessToken();
    }

    try {
        const url = 'https://api.weixin.qq.com/cgi-bin/token';
        const response = await axios.get(url, {
            params: {
                grant_type: 'client_credential',
                appid: config.wechat.appId,
                secret: config.wechat.appSecret,
            },
        });

        if (response.data.errcode) {
            throw new Error(`WeChat API error: ${response.data.errcode} - ${response.data.errmsg}`);
        }

        const { access_token, expires_in } = response.data;
        const now = Math.floor(Date.now() / 1000);

        const tokenData: TokenCache = {
            accessToken: access_token,
            expiresAt: now + expires_in,
        };

        // Store in Redis with expiration
        await redis.set(TOKEN_KEY, JSON.stringify(tokenData), 'EX', expires_in);

        console.log(`WeChat access token refreshed, expires in ${expires_in}s`);

        return access_token;
    } finally {
        // Release lock
        await redis.del(TOKEN_LOCK_KEY);
    }
}

/**
 * Force refresh the access token (useful for error recovery)
 */
export async function forceRefreshToken(): Promise<string> {
    const redis = getRedis();
    await redis.del(TOKEN_KEY);
    return refreshAccessToken();
}
