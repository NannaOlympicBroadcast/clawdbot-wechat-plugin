/**
 * Clawdbot Webhook Server Plugin
 * 
 * This plugin starts an HTTP server that receives webhook requests from external
 * services (like clawdbot-wechat-bridge), processes them through the Clawdbot
 * agent, and sends results back to a callback URL.
 */

import Fastify, { FastifyInstance } from 'fastify';
import axios from 'axios';
import crypto from 'crypto';

// Types for Clawdbot plugin API
interface ClawdbotPluginApi {
    logger: {
        info: (msg: string, ...args: unknown[]) => void;
        warn: (msg: string, ...args: unknown[]) => void;
        error: (msg: string, ...args: unknown[]) => void;
        debug: (msg: string, ...args: unknown[]) => void;
    };
    config: PluginConfig;
    // Chat API for sending messages to agent (may not exist in all versions)
    chat?: {
        send: (options: ChatSendOptions) => Promise<ChatSendResult>;
    };
    registerService: (service: BackgroundService) => void;
    registerCommand: (command: PluginCommand) => void;
    registerGatewayMethod: (name: string, handler: (ctx: RpcContext) => void) => void;
    // Allow additional unknown properties
    [key: string]: unknown;
}

interface PluginConfig {
    plugins?: {
        entries?: {
            'webhook-server'?: {
                enabled?: boolean;
                config?: WebhookServerConfig;
            };
        };
    };
}

interface WebhookServerConfig {
    port?: number;
    host?: string;
    authToken?: string;
    timeout?: number;
}

interface ChatSendOptions {
    message: string;
    channel?: string;
    conversationId?: string;
    senderId?: string;
    metadata?: Record<string, unknown>;
}

interface ChatSendResult {
    text: string;
    conversationId?: string;
    messageId?: string;
    metadata?: {
        thinking_time_ms?: number;
        model?: string;
        tokens_used?: number;
    };
}

interface BackgroundService {
    id: string;
    start: () => Promise<void> | void;
    stop: () => Promise<void> | void;
}

interface PluginCommand {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: CommandContext) => Promise<{ text: string }> | { text: string };
}

interface CommandContext {
    senderId?: string;
    channel: string;
    isAuthorizedSender: boolean;
    args?: string;
    commandBody: string;
    config: PluginConfig;
}

interface RpcContext {
    respond: (success: boolean, data: unknown) => void;
    params?: Record<string, unknown>;
}

// Webhook payload types
interface WebhookPayload {
    task: string;
    callback_url: string;
    metadata?: {
        openid?: string;
        msg_type?: string;
        msg_id?: string;
        timestamp?: number;
        [key: string]: unknown;
    };
}

interface CallbackPayload {
    success: boolean;
    result?: string;
    error?: string;
    metadata?: {
        thinking_time_ms?: number;
        model?: string;
    };
}

// Plugin state
let server: FastifyInstance | null = null;
let pluginApi: ClawdbotPluginApi | null = null;
let generatedAuthToken: string | null = null;

// Token persistence path
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Get the path for storing plugin data
 */
function getPluginDataDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.clawdbot', 'plugin-data', 'webhook-server');
}

/**
 * Get the path for the auth token file
 */
function getTokenFilePath(): string {
    return path.join(getPluginDataDir(), '.auth-token');
}

/**
 * Load persisted auth token from file
 */
function loadPersistedToken(): string | null {
    try {
        const tokenPath = getTokenFilePath();
        if (fs.existsSync(tokenPath)) {
            const token = fs.readFileSync(tokenPath, 'utf-8').trim();
            if (token && token.startsWith('wh_')) {
                return token;
            }
        }
    } catch {
        // Ignore errors, will generate new token
    }
    return null;
}

/**
 * Save auth token to file for persistence
 */
function savePersistedToken(token: string, api: ClawdbotPluginApi): void {
    try {
        const dataDir = getPluginDataDir();
        // Create directory if it doesn't exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const tokenPath = getTokenFilePath();
        fs.writeFileSync(tokenPath, token, { mode: 0o600 }); // Secure permissions
        api.logger.info(`[webhook-server] Token saved to: ${tokenPath}`);
    } catch (error) {
        api.logger.warn(`[webhook-server] Failed to save token: ${error}`);
    }
}

/**
 * Generate a secure auth token
 */
function generateSecureToken(): string {
    // Generate a secure random token using UUID v4 format
    return `wh_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Get plugin config with defaults. Auto-generates authToken if not provided.
 * Persists the token to local storage for reuse across restarts.
 */
function getPluginConfig(api: ClawdbotPluginApi): Required<WebhookServerConfig> {
    const config = api.config.plugins?.entries?.['webhook-server']?.config || {};

    // Handle authToken - load persisted, auto-generate if missing or placeholder
    let authToken = config.authToken ?? '';
    if (!authToken || authToken.startsWith('$auto:')) {
        if (!generatedAuthToken) {
            // Try to load persisted token first
            const persistedToken = loadPersistedToken();
            if (persistedToken) {
                generatedAuthToken = persistedToken;
                api.logger.info(`[webhook-server] Loaded persisted authToken: ${generatedAuthToken.slice(0, 12)}...`);
            } else {
                // Generate new token and save it
                generatedAuthToken = generateSecureToken();
                savePersistedToken(generatedAuthToken, api);
                api.logger.info(`[webhook-server] Generated new authToken: ${generatedAuthToken}`);
            }
        }
        authToken = generatedAuthToken;
    }

    return {
        port: config.port ?? 8765,
        host: config.host ?? '0.0.0.0',
        authToken,
        timeout: config.timeout ?? 300000, // 5 minutes default
    };
}

/**
 * Chat RPC response format
 */
interface ChatRpcResult {
    text: string;
    model?: string;
}

/**
 * Extended API type with runtime helpers (based on Zalo plugin pattern)
 */
type ExtendedPluginApi = ClawdbotPluginApi & {
    runtime?: PluginRuntime;
    callRpc?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Plugin Runtime type (based on Zalo's getZaloRuntime pattern)
 */
interface PluginRuntime {
    channel?: {
        reply?: {
            dispatchReplyWithBufferedBlockDispatcher?: (params: {
                ctx: Record<string, unknown>;
                cfg: Record<string, unknown>;
                dispatcherOptions: {
                    deliver: (payload: { text?: string }) => Promise<void>;
                    onError: (err: unknown, info: { kind: string }) => void;
                };
            }) => Promise<void>;
            resolveEnvelopeFormatOptions?: (cfg: Record<string, unknown>) => unknown;
            formatAgentEnvelope?: (params: Record<string, unknown>) => string;
            finalizeInboundContext?: (params: Record<string, unknown>) => Record<string, unknown>;
        };
        session?: {
            resolveStorePath?: (store: unknown, params: { agentId?: string }) => string;
            recordInboundSession?: (params: Record<string, unknown>) => Promise<void>;
        };
        routing?: {
            resolveAgentRoute?: (params: Record<string, unknown>) => { agentId?: string; sessionKey: string; accountId?: string };
        };
    };
    agent?: {
        chat?: (options: { message: string; conversationId?: string }) => Promise<{ text: string; model?: string }>;
        invoke?: (options: { input: string; ctx?: Record<string, unknown> }) => Promise<{ output: string }>;
    };
    [key: string]: unknown;
}

// Store plugin runtime globally for webhook handlers
let pluginRuntime: PluginRuntime | null = null;
let pluginConfig: PluginConfig | null = null;

/**
 * Call Clawdbot's agent via available API methods
 * Tries multiple approaches in order of preference
 */
async function callChatRpc(
    api: ClawdbotPluginApi,
    options: {
        message: string;
        conversationId?: string;
        metadata?: Record<string, unknown>;
    }
): Promise<ChatRpcResult> {
    const extApi = api as ExtendedPluginApi;
    const runtime = extApi.runtime;

    api.logger.info(`Sending message to agent: ${options.message.slice(0, 50)}...`);

    // Log runtime structure for debugging
    if (runtime) {
        const runtimeKeys = Object.keys(runtime);
        api.logger.info(`Runtime structure: ${runtimeKeys.join(', ')}`);

        // Deep explore runtime.channel if exists
        if (runtime.channel) {
            api.logger.info(`Runtime.channel keys: ${Object.keys(runtime.channel).join(', ')}`);
        }

        // Check for agent methods
        if (runtime.agent) {
            api.logger.info(`Runtime.agent keys: ${Object.keys(runtime.agent).join(', ')}`);
        }
    }

    // Method 1: Try runtime.agent.invoke if available (simplest approach)
    if (runtime?.agent?.invoke && typeof runtime.agent.invoke === 'function') {
        try {
            api.logger.info('Using runtime.agent.invoke method');
            const result = await runtime.agent.invoke({
                input: options.message,
                ctx: {
                    conversationId: options.conversationId || 'webhook-default',
                    ...options.metadata,
                },
            });
            return {
                text: result.output || 'No response',
            };
        } catch (error) {
            api.logger.warn(`runtime.agent.invoke failed: ${error}`);
        }
    }

    // Method 2: Try runtime.agent.chat if available
    if (runtime?.agent?.chat && typeof runtime.agent.chat === 'function') {
        try {
            api.logger.info('Using runtime.agent.chat method');
            const result = await runtime.agent.chat({
                message: options.message,
                conversationId: options.conversationId || 'webhook-default',
            });
            return {
                text: result.text || 'No response',
                model: result.model,
            };
        } catch (error) {
            api.logger.warn(`runtime.agent.chat failed: ${error}`);
        }
    }

    // Method 3: Try api.chat.send if available
    if (api.chat && typeof api.chat.send === 'function') {
        try {
            api.logger.info('Using api.chat.send method');
            const result = await api.chat.send({
                message: options.message,
                conversationId: options.conversationId || 'webhook-default',
                metadata: options.metadata,
            });
            return {
                text: result.text || 'No response',
                model: result.metadata?.model,
            };
        } catch (error) {
            api.logger.warn(`api.chat.send failed: ${error}`);
        }
    }

    // Method 4: Use channel dispatch pattern (like Zalo)
    if (runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
        try {
            api.logger.info('Using channel dispatch pattern');

            let responseText = '';

            await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
                ctx: {
                    Body: options.message,
                    RawBody: options.message,
                    From: `webhook:${options.conversationId || 'default'}`,
                    To: 'webhook:agent',
                    SessionKey: options.conversationId || 'webhook-default',
                    Provider: 'webhook',
                    Surface: 'webhook',
                },
                cfg: (pluginConfig || {}) as Record<string, unknown>,
                dispatcherOptions: {
                    deliver: async (payload) => {
                        responseText += payload.text || '';
                    },
                    onError: (err, info) => {
                        api.logger.error(`Dispatch error (${info.kind}): ${err}`);
                    },
                },
            });

            return {
                text: responseText || 'No response',
            };
        } catch (error) {
            api.logger.warn(`Channel dispatch failed: ${error}`);
        }
    }

    // Log detailed structure for debugging
    const apiMethods = Object.entries(api).map(([key, value]) => {
        const type = typeof value;
        return `${key}: ${type}`;
    }).join(', ');
    api.logger.error(`No chat method available! API structure: ${apiMethods}`);

    throw new Error('No chat method available in Clawdbot Plugin API. Check plugin compatibility.');
}


/**
 * Process a webhook task and send result to callback URL
 */
async function processWebhookTask(
    api: ClawdbotPluginApi,
    payload: WebhookPayload,
    timeout: number
): Promise<void> {
    const startTime = Date.now();

    api.logger.info(`Processing task for ${payload.metadata?.openid || 'unknown'}: ${payload.task.slice(0, 50)}...`);

    try {
        // Use the Gateway RPC method to send a chat message
        // This calls the internal Clawdbot chat.send RPC
        const result = await Promise.race([
            callChatRpc(api, {
                message: payload.task,
                conversationId: `webhook-${payload.metadata?.openid || 'default'}`,
                metadata: payload.metadata,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Task timeout')), timeout)
            ),
        ]);

        const thinkingTimeMs = Date.now() - startTime;

        api.logger.info(`Task completed in ${thinkingTimeMs}ms`);

        // Send success callback
        const callbackPayload: CallbackPayload = {
            success: true,
            result: result.text,
            metadata: {
                thinking_time_ms: thinkingTimeMs,
                model: result.model,
            },
        };

        await sendCallback(api, payload.callback_url, callbackPayload);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        api.logger.error(`Task failed: ${errorMessage}`);

        // Send error callback
        const callbackPayload: CallbackPayload = {
            success: false,
            error: errorMessage,
            metadata: {
                thinking_time_ms: Date.now() - startTime,
            },
        };

        await sendCallback(api, payload.callback_url, callbackPayload);
    }
}

/**
 * Send result to callback URL
 */
async function sendCallback(
    api: ClawdbotPluginApi,
    callbackUrl: string,
    payload: CallbackPayload
): Promise<void> {
    try {
        const response = await axios.post(callbackUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout for callback
        });

        api.logger.info(`Callback sent to ${callbackUrl}, status: ${response.status}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        api.logger.error(`Failed to send callback to ${callbackUrl}: ${errorMessage}`);
    }
}

/**
 * Create and configure the Fastify server
 */
function createServer(api: ClawdbotPluginApi): FastifyInstance {
    const config = getPluginConfig(api);

    const app = Fastify({
        logger: false, // We use Clawdbot's logger
    });

    // Health check
    app.get('/health', async () => {
        return { status: 'ok', plugin: 'webhook-server' };
    });

    // Main webhook endpoint
    app.post<{ Body: WebhookPayload }>('/webhook', async (request, reply) => {
        // Validate auth token
        const authHeader = request.headers.authorization;
        const expectedToken = `Bearer ${config.authToken}`;

        if (config.authToken && authHeader !== expectedToken) {
            api.logger.warn('Unauthorized webhook request');
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const payload = request.body;

        // Validate payload
        if (!payload.task || !payload.callback_url) {
            return reply.code(400).send({
                error: 'Invalid payload',
                required: ['task', 'callback_url']
            });
        }

        // Validate callback URL
        try {
            new URL(payload.callback_url);
        } catch {
            return reply.code(400).send({ error: 'Invalid callback_url' });
        }

        // Process task asynchronously (fire-and-forget)
        processWebhookTask(api, payload, config.timeout).catch((error) => {
            api.logger.error(`Unhandled error in task processing: ${error}`);
        });

        // Return immediately with accepted status
        return reply.code(202).send({
            status: 'accepted',
            message: 'Task queued for processing',
        });
    });

    return app;
}

/**
 * Main plugin export
 */
export default function register(api: ClawdbotPluginApi): void {
    pluginApi = api;

    // Get config (this will auto-generate authToken if needed)
    const config = getPluginConfig(api);

    api.logger.info(`[webhook-server] Configured - Port: ${config.port}, Host: ${config.host}`);

    // Register background service
    api.registerService({
        id: 'webhook-server',

        async start() {
            server = createServer(api);

            try {
                await server.listen({ port: config.port, host: config.host });
                api.logger.info(`Webhook server listening on http://${config.host}:${config.port}`);
            } catch (error) {
                api.logger.error(`Failed to start webhook server: ${error}`);
                throw error;
            }
        },

        async stop() {
            if (server) {
                await server.close();
                server = null;
                api.logger.info('Webhook server stopped');
            }
        },
    });

    // Register status command
    api.registerCommand({
        name: 'webhook-status',
        description: 'Show webhook server status',
        handler: () => {
            const config = getPluginConfig(api);
            const status = server ? 'running' : 'stopped';
            return {
                text: `🔌 Webhook Server Status: ${status}\n📍 Endpoint: http://${config.host}:${config.port}/webhook`,
            };
        },
    });

    // Register RPC method for status checks
    api.registerGatewayMethod('webhook-server.status', ({ respond }) => {
        const config = getPluginConfig(api);
        respond(true, {
            running: !!server,
            port: config.port,
            host: config.host,
        });
    });

    api.logger.info('Webhook server plugin registered');
}
