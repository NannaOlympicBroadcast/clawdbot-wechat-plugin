import { XMLParser, XMLBuilder } from 'fast-xml-parser';

/**
 * WeChat message structure
 */
export interface WeChatMessage {
    ToUserName: string;
    FromUserName: string; // OpenID of the sender
    CreateTime: number;
    MsgType: 'text' | 'image' | 'voice' | 'video' | 'shortvideo' | 'location' | 'link' | 'event';
    Content?: string; // For text messages
    MsgId?: string;
    // Event-specific fields
    Event?: string;
    EventKey?: string;
    // Media fields
    PicUrl?: string;
    MediaId?: string;
    Format?: string;
    Recognition?: string;
    ThumbMediaId?: string;
    // Location fields
    Location_X?: number;
    Location_Y?: number;
    Scale?: number;
    Label?: string;
    // Link fields
    Title?: string;
    Description?: string;
    Url?: string;
}

/**
 * WeChat reply message structure
 */
export interface WeChatReply {
    ToUserName: string;
    FromUserName: string;
    CreateTime: number;
    MsgType: 'text' | 'image' | 'voice' | 'video' | 'music' | 'news';
    Content?: string;
    // Other media reply fields as needed
}

const xmlParser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: true,
});

const xmlBuilder = new XMLBuilder({
    ignoreAttributes: true,
    format: true,
    suppressEmptyNode: true,
});

/**
 * Parse incoming WeChat XML message
 */
export function parseWeChatXml(xml: string): WeChatMessage {
    const parsed = xmlParser.parse(xml);
    return parsed.xml as WeChatMessage;
}

/**
 * Build XML response for WeChat
 */
export function buildWeChatReply(reply: WeChatReply): string {
    return xmlBuilder.build({ xml: reply });
}

/**
 * Build a text reply for WeChat passive response
 */
export function buildTextReply(
    toUser: string,
    fromUser: string,
    content: string
): string {
    return buildWeChatReply({
        ToUserName: toUser,
        FromUserName: fromUser,
        CreateTime: Math.floor(Date.now() / 1000),
        MsgType: 'text',
        Content: content,
    });
}
