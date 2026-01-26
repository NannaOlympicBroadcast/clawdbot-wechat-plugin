import crypto from 'crypto';

/**
 * Validate WeChat signature
 * @see https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html
 */
export function validateSignature(
    token: string,
    signature: string,
    timestamp: string,
    nonce: string
): boolean {
    const arr = [token, timestamp, nonce].sort();
    const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    return hash === signature;
}

/**
 * Generate signature for WeChat callback validation
 */
export function generateSignature(
    token: string,
    timestamp: string,
    nonce: string
): string {
    const arr = [token, timestamp, nonce].sort();
    return crypto.createHash('sha1').update(arr.join('')).digest('hex');
}
