/**
 * Clawdbot Webhook Server Plugin
 * 
 * This plugin starts an HTTP server that receives webhook requests from external
 * services (like clawdbot-wechat-bridge), processes them through the Clawdbot
 * agent, and sends results back to a callback URL.
 */

import Fastify, { FastifyInstance } from 'fastify';
import axios from 'axios';

// Types for Clawdbot plugin API
interface ClawdbotPluginApi {
    logger: {
        info: (msg: string, ...args: unknown[]) => void;
        warn: (msg: string, ...args: unknown[]) => void;
        error: (msg: string, ...args: unknown[]) => void;
        debug: (msg: string, ...args: unknown[]) => void;
    };
    config: PluginConfig;
    runtime: {
        agent: {
            run: (options: AgentRunOptions) => Promise<AgentRunResult>;
        };
    };
    registerService: (service: BackgroundService) => void;
    registerCommand: (command: PluginCommand) => void;
    registerGatewayMethod: (name: string, handler: (ctx: RpcContext) => void) => void;
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

interface AgentRunOptions {
    message: string;
    context?: {
        channel?: string;
        senderId?: string;
        threadId?: string;
        metadata?: Record<string, unknown>;
    };
}

interface AgentRunResult {
    text: string;
    thinking?: string;
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

/**
 * Get plugin config with defaults
 */
function getPluginConfig(api: ClawdbotPluginApi): Required<WebhookServerConfig> {
    const config = api.config.plugins?.entries?.['webhook-server']?.config || {};
    return {
        port: config.port ?? 8765,
        host: config.host ?? '0.0.0.0',
        authToken: config.authToken ?? '',
        timeout: config.timeout ?? 300000, // 5 minutes default
    };
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
        // Run the agent with the task
        const result = await Promise.race([
            api.runtime.agent.run({
                message: payload.task,
                context: {
                    channel: 'webhook',
                    senderId: payload.metadata?.openid,
                    metadata: payload.metadata,
                },
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
                thinking_time_ms: result.metadata?.thinking_time_ms || thinkingTimeMs,
                model: result.metadata?.model,
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

    const config = getPluginConfig(api);

    // Validate required config
    if (!config.authToken) {
        api.logger.warn('webhook-server: No authToken configured. Set plugins.entries.webhook-server.config.authToken');
    }

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
