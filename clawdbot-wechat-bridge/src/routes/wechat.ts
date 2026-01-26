import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config.js';
import { validateSignature } from '../utils/signature.js';
import { parseWeChatXml, buildTextReply } from '../utils/xml-parser.js';
import { getBinding, setBinding, deleteBinding } from '../services/redis.js';
import { forwardToClawdbot } from '../services/clawdbot-forwarder.js';

// Bind command format: bind <url> <token>
const BIND_REGEX = /^bind\s+(\S+)\s+(\S+)$/i;
// Unbind command
const UNBIND_REGEX = /^unbind$/i;

interface WeChatQueryParams {
    signature: string;
    timestamp: string;
    nonce: string;
    echostr?: string;
}

export async function wechatRoutes(fastify: FastifyInstance): Promise<void> {
    const config = getConfig();

    /**
     * GET /wechat - WeChat server validation endpoint
     * WeChat sends GET to verify our server
     */
    fastify.get<{ Querystring: WeChatQueryParams }>(
        '/wechat',
        async (request, reply) => {
            const { signature, timestamp, nonce, echostr } = request.query;

            if (!signature || !timestamp || !nonce) {
                return reply.code(400).send('Missing parameters');
            }

            const isValid = validateSignature(config.wechat.token, signature, timestamp, nonce);

            if (isValid && echostr) {
                // Return echostr for WeChat verification
                return reply.type('text/plain').send(echostr);
            }

            return reply.code(403).send('Invalid signature');
        }
    );

    /**
     * POST /wechat - Handle incoming WeChat messages
     */
    fastify.post<{ Querystring: WeChatQueryParams }>(
        '/wechat',
        {
            config: {
                rawBody: true, // We need raw body for XML
            },
        },
        async (request, reply) => {
            const { signature, timestamp, nonce } = request.query;

            // Validate signature
            if (!signature || !timestamp || !nonce) {
                return reply.code(400).send('Missing parameters');
            }

            const isValid = validateSignature(config.wechat.token, signature, timestamp, nonce);
            if (!isValid) {
                return reply.code(403).send('Invalid signature');
            }

            // Parse XML message
            let message;
            try {
                const body = request.body as string;
                message = parseWeChatXml(body);
            } catch (error) {
                console.error('Failed to parse WeChat XML:', error);
                return reply.code(400).send('Invalid XML');
            }

            const openId = message.FromUserName;
            const toUser = message.ToUserName;

            // Handle events
            if (message.MsgType === 'event') {
                if (message.Event === 'subscribe') {
                    // New follower - send welcome message
                    const welcomeMsg = `👋 欢迎关注！

这是一个 Clawdbot 桥接服务。请发送以下指令绑定你的 Clawdbot 实例：

bind <你的Clawdbot地址> <Token>

例如：
bind https://my-clawdbot.example.com/webhook abc123

绑定后，你可以直接发送消息与你的 Clawdbot 对话。

其他指令：
• unbind - 解除绑定`;
                    return reply.type('text/xml').send(buildTextReply(openId, toUser, welcomeMsg));
                }
                // Other events: return empty
                return reply.type('text/plain').send('');
            }

            // Check binding
            const binding = await getBinding(openId);

            if (!binding) {
                // Not bound - check if this is a bind command
                if (message.MsgType === 'text' && message.Content) {
                    const bindMatch = message.Content.match(BIND_REGEX);
                    if (bindMatch) {
                        const [, endpoint, token] = bindMatch;

                        // Basic URL validation
                        try {
                            new URL(endpoint);
                        } catch {
                            return reply.type('text/xml').send(
                                buildTextReply(openId, toUser, '❌ 无效的 URL 格式，请检查后重试。')
                            );
                        }

                        await setBinding(openId, endpoint, token);
                        return reply.type('text/xml').send(
                            buildTextReply(openId, toUser, `✅ 绑定成功！

你的 Clawdbot 地址：${endpoint}

现在可以直接发送消息与你的 Clawdbot 对话了。

提示：发送 unbind 可以解除绑定。`)
                        );
                    }
                }

                // Not a bind command - prompt user to bind
                return reply.type('text/xml').send(
                    buildTextReply(openId, toUser, `👋 请先绑定你的 Clawdbot 实例。

发送格式：
bind <你的Clawdbot地址> <Token>

例如：
bind https://my-clawdbot.example.com/webhook abc123`)
                );
            }

            // Already bound - check for unbind command
            if (message.MsgType === 'text' && message.Content) {
                if (UNBIND_REGEX.test(message.Content.trim())) {
                    await deleteBinding(openId);
                    return reply.type('text/xml').send(
                        buildTextReply(openId, toUser, `✅ 已解除绑定。

你可以随时使用 bind 指令重新绑定新的 Clawdbot 实例。`)
                    );
                }
            }

            // Forward message to Clawdbot (async, fire-and-forget)
            forwardToClawdbot(message, binding);

            // Return empty string immediately to avoid WeChat timeout
            // We use customer service message API later to send the actual response
            return reply.type('text/xml').send(
                buildTextReply(openId, toUser, '⏳ 正在处理中，请稍候...')
            );
        }
    );
}
