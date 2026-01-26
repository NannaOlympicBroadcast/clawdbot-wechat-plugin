/**
 * Environment configuration for the WeChat Bridge service
 */
export interface Config {
    // Server
    port: number;
    host: string;

    // WeChat Official Account
    wechat: {
        appId: string;
        appSecret: string;
        token: string; // Used for signature validation
        encodingAESKey?: string; // Optional, for message encryption
    };

    // Redis
    redis: {
        url: string;
    };

    // Bridge
    bridge: {
        baseUrl: string; // Public URL of this bridge (for callback URLs)
    };
}

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export function loadConfig(): Config {
    return {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || '0.0.0.0',

        wechat: {
            appId: requireEnv('WECHAT_APPID'),
            appSecret: requireEnv('WECHAT_APPSECRET'),
            token: requireEnv('WECHAT_TOKEN'),
            encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
        },

        redis: {
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        },

        bridge: {
            baseUrl: requireEnv('BRIDGE_BASE_URL'),
        },
    };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
    if (!configInstance) {
        configInstance = loadConfig();
    }
    return configInstance;
}
