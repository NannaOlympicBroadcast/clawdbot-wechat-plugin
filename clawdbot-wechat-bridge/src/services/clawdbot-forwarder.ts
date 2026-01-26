import axios from 'axios';
import { getConfig } from '../config.js';
import type { WeChatMessage } from '../utils/xml-parser.js';
import type { UserBinding } from './redis.js';

/**
 * Payload sent to Clawdbot webhook
 */
export interface ClawdbotWebhookPayload {
    task: string;
    callback_url: string;
    metadata: {
        openid: string;
        msg_type: string;
        msg_id?: string;
        timestamp: number;
    };
}

/**
 * Forward a WeChat message to the user's Clawdbot instance
 * This is done asynchronously (fire-and-forget)
 */
export function forwardToClawdbot(
    message: WeChatMessage,
    binding: UserBinding
): void {
    // Fire-and-forget: don't await
    doForward(message, binding).catch((error) => {
        console.error(`Failed to forward message to Clawdbot:`, error);
    });
}

/**
 * Internal forwarding implementation
 */
async function doForward(
    message: WeChatMessage,
    binding: UserBinding
): Promise<void> {
    const config = getConfig();

    // Determine the task content based on message type
    let task: string;
    switch (message.MsgType) {
        case 'text':
            task = message.Content || '';
            break;
        case 'voice':
            // Use voice recognition result if available
            task = message.Recognition || '[语音消息，无法识别]';
            break;
        case 'image':
            task = `[图片消息] ${message.PicUrl || ''}`;
            break;
        case 'location':
            task = `[位置消息] 经度: ${message.Location_Y}, 纬度: ${message.Location_X}, ${message.Label || ''}`;
            break;
        case 'link':
            task = `[链接消息] ${message.Title || ''}\n${message.Description || ''}\n${message.Url || ''}`;
            break;
        default:
            task = `[${message.MsgType}消息]`;
    }

    const callbackUrl = `${config.bridge.baseUrl}/callback/${message.FromUserName}`;

    const payload: ClawdbotWebhookPayload = {
        task,
        callback_url: callbackUrl,
        metadata: {
            openid: message.FromUserName,
            msg_type: message.MsgType,
            msg_id: message.MsgId,
            timestamp: message.CreateTime,
        },
    };

    console.log(`Forwarding message to Clawdbot: ${binding.endpoint}`);

    const response = await axios.post(binding.endpoint, payload, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${binding.token}`,
        },
        timeout: 10000, // 10 second timeout for the initial handshake
    });

    console.log(`Clawdbot responded with status: ${response.status}`);
}

/**
 * Synchronous forward for testing (waits for Clawdbot response)
 */
export async function forwardToClawdbotSync(
    message: WeChatMessage,
    binding: UserBinding
): Promise<boolean> {
    try {
        await doForward(message, binding);
        return true;
    } catch (error) {
        console.error('Failed to forward to Clawdbot:', error);
        return false;
    }
}
