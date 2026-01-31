#!/usr/bin/env node
/**
 * encoding-utils.js - Node.js 字符编码处理工具
 * 
 * 用法:
 *   node encoding-utils.js decode "乱码字符串"
 *   node encoding-utils.js encode "中文字符串"
 *   node encoding-utils.js detect "字符串"
 *   node encoding-utils.js fix-file input.txt output.txt
 */

const fs = require('fs');
const { Buffer } = require('buffer');

// 颜色输出
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    reset: '\x1b[0m'
};

function say(msg) {
    console.log(`${colors.green}==>${colors.reset} ${msg}`);
}

function warn(msg) {
    console.log(`${colors.yellow}[warn]${colors.reset} ${msg}`);
}

function err(msg) {
    console.error(`${colors.red}[error]${colors.reset} ${msg}`);
}

/**
 * 检测字符串编码
 */
function detectEncoding(str) {
    const encodings = ['utf8', 'latin1', 'gbk', 'gb2312', 'big5'];
    const results = [];

    for (const encoding of encodings) {
        try {
            const buffer = Buffer.from(str, 'latin1');
            const decoded = buffer.toString(encoding);

            // 检查是否包含有效的中文字符
            const hasChinese = /[\u4e00-\u9fa5]/.test(decoded);
            const hasGarbage = /[�\ufffd]/.test(decoded);

            results.push({
                encoding,
                decoded,
                hasChinese,
                hasGarbage,
                score: (hasChinese ? 10 : 0) - (hasGarbage ? 5 : 0)
            });
        } catch (e) {
            // 忽略不支持的编码
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
}

/**
 * 修复乱码字符串
 */
function fixGarbledText(str) {
    // 常见的乱码模式
    const patterns = [
        // UTF-8 被错误解析为 Latin1
        {
            name: 'UTF-8 -> Latin1',
            fix: (s) => Buffer.from(s, 'latin1').toString('utf8')
        },
        // GBK 被错误解析为 UTF-8
        {
            name: 'GBK -> UTF-8',
            fix: (s) => {
                try {
                    const iconv = require('iconv-lite');
                    return iconv.decode(Buffer.from(s, 'binary'), 'gbk');
                } catch (e) {
                    return s;
                }
            }
        }
    ];

    say('尝试修复乱码...');
    console.log(`原始字符串: ${str}\n`);

    for (const pattern of patterns) {
        try {
            const fixed = pattern.fix(str);
            if (fixed !== str && !/[�\ufffd]/.test(fixed)) {
                say(`${pattern.name} 修复成功:`);
                console.log(fixed);
                return fixed;
            }
        } catch (e) {
            // 继续尝试下一个模式
        }
    }

    warn('无法自动修复,尝试检测编码:');
    const results = detectEncoding(str);
    results.slice(0, 3).forEach(r => {
        console.log(`\n[${r.encoding}] (score: ${r.score}):`);
        console.log(r.decoded);
    });

    return str;
}

/**
 * 转换字符串编码
 */
function convertEncoding(str, fromEncoding, toEncoding) {
    try {
        const buffer = Buffer.from(str, fromEncoding);
        return buffer.toString(toEncoding);
    } catch (e) {
        err(`编码转换失败: ${e.message}`);
        return str;
    }
}

/**
 * 修复文件编码
 */
function fixFileEncoding(inputFile, outputFile, fromEncoding = 'latin1', toEncoding = 'utf8') {
    try {
        say(`读取文件: ${inputFile}`);
        const content = fs.readFileSync(inputFile, fromEncoding);

        say(`转换编码: ${fromEncoding} -> ${toEncoding}`);
        const fixed = Buffer.from(content, 'latin1').toString(toEncoding);

        say(`写入文件: ${outputFile}`);
        fs.writeFileSync(outputFile, fixed, toEncoding);

        say('✅ 文件编码修复完成!');
    } catch (e) {
        err(`文件处理失败: ${e.message}`);
        process.exit(1);
    }
}

/**
 * 确保字符串为 UTF-8
 */
function ensureUtf8(str) {
    // 检查是否已经是有效的 UTF-8
    if (Buffer.isBuffer(str)) {
        return str.toString('utf8');
    }

    // 如果包含乱码字符,尝试修复
    if (/[�\ufffd]/.test(str) || /\?{3,}/.test(str)) {
        return fixGarbledText(str);
    }

    return str;
}

// CLI 命令处理
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
字符编码处理工具

用法:
  node encoding-utils.js decode "乱码字符串"        # 自动修复乱码
  node encoding-utils.js encode "中文" [编码]       # 转换编码
  node encoding-utils.js detect "字符串"            # 检测可能的编码
  node encoding-utils.js fix-file input.txt output.txt [from] [to]  # 修复文件编码

示例:
  node encoding-utils.js decode "ä½\u00a0å¥½"
  node encoding-utils.js encode "你好" utf8
  node encoding-utils.js detect "乱码文本"
  node encoding-utils.js fix-file input.txt output.txt latin1 utf8
    `);
        process.exit(0);
    }

    switch (command) {
        case 'decode':
        case 'fix':
            if (!args[1]) {
                err('请提供要修复的字符串');
                process.exit(1);
            }
            fixGarbledText(args[1]);
            break;

        case 'encode':
        case 'convert':
            if (!args[1]) {
                err('请提供要转换的字符串');
                process.exit(1);
            }
            const toEnc = args[2] || 'utf8';
            const result = convertEncoding(args[1], 'utf8', toEnc);
            console.log(result);
            break;

        case 'detect':
            if (!args[1]) {
                err('请提供要检测的字符串');
                process.exit(1);
            }
            const results = detectEncoding(args[1]);
            console.log('\n可能的编码:');
            results.forEach(r => {
                console.log(`\n[${r.encoding}] (score: ${r.score}):`);
                console.log(r.decoded);
            });
            break;

        case 'fix-file':
            if (!args[1] || !args[2]) {
                err('请提供输入和输出文件路径');
                process.exit(1);
            }
            const fromEnc = args[3] || 'latin1';
            const toEnc2 = args[4] || 'utf8';
            fixFileEncoding(args[1], args[2], fromEnc, toEnc2);
            break;

        default:
            err(`未知命令: ${command}`);
            process.exit(1);
    }
}

// 如果作为模块导入
if (require.main === module) {
    main();
} else {
    module.exports = {
        detectEncoding,
        fixGarbledText,
        convertEncoding,
        ensureUtf8,
        fixFileEncoding
    };
}
