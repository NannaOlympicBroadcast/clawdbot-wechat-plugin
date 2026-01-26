import axios from 'axios';
import { getAccessToken, forceRefreshToken } from './wechat-token.js';

const CUSTOMER_SERVICE_API = 'https://api.weixin.qq.com/cgi-bin/message/custom/send';

interface CustomerServiceTextMessage {
    touser: string;
    msgtype: 'text';
    text: {
        content: string;
    };
}

interface CustomerServiceImageMessage {
    touser: string;
    msgtype: 'image';
    image: {
        media_id: string;
    };
}

type CustomerServiceMessage = CustomerServiceTextMessage | CustomerServiceImageMessage;

/**
 * Send a customer service message to a WeChat user
 */
export async function sendCustomerServiceMessage(
    message: CustomerServiceMessage,
    retryOnTokenError = true
): Promise<boolean> {
    try {
        const accessToken = await getAccessToken();

        const response = await axios.post(
            `${CUSTOMER_SERVICE_API}?access_token=${accessToken}`,
            message,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.errcode === 0) {
            return true;
        }

        // Token expired error - retry with fresh token
        if (response.data.errcode === 40001 && retryOnTokenError) {
            console.warn('Access token expired, refreshing...');
            await forceRefreshToken();
            return sendCustomerServiceMessage(message, false);
        }

        console.error('Failed to send customer service message:', response.data);
        return false;
    } catch (error) {
        console.error('Error sending customer service message:', error);
        return false;
    }
}

/**
 * Send a text message to a WeChat user via Customer Service API
 */
export async function sendTextMessage(openId: string, content: string): Promise<boolean> {
    // WeChat limits message length to 600 characters for customer service messages
    // Split long messages if needed
    const MAX_LENGTH = 600;

    if (content.length <= MAX_LENGTH) {
        return sendCustomerServiceMessage({
            touser: openId,
            msgtype: 'text',
            text: { content },
        });
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
        if (remaining.length <= MAX_LENGTH) {
            chunks.push(remaining);
            break;
        }

        // Try to split at a natural break point
        let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
        if (splitIndex === -1 || splitIndex < MAX_LENGTH / 2) {
            splitIndex = remaining.lastIndexOf(' ', MAX_LENGTH);
        }
        if (splitIndex === -1 || splitIndex < MAX_LENGTH / 2) {
            splitIndex = MAX_LENGTH;
        }

        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trimStart();
    }

    // Send chunks with small delay between them
    let success = true;
    for (let i = 0; i < chunks.length; i++) {
        const chunk = i === 0 ? chunks[i] : `(${i + 1}/${chunks.length}) ${chunks[i]}`;
        const result = await sendCustomerServiceMessage({
            touser: openId,
            msgtype: 'text',
            text: { content: chunk },
        });

        if (!result) {
            success = false;
        }

        // Small delay between messages to preserve order
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return success;
}
