# 字符编码处理工具

本目录包含用于修复 Ubuntu/WSL 中文字符编码问题的工具。

## 🛠️ 工具列表

### 1. fix-encoding.sh - 系统级编码修复

自动配置 Ubuntu/WSL 系统的 UTF-8 编码支持。

**使用方法:**

```bash
# 在 WSL/Ubuntu 中运行
chmod +x scripts/fix-encoding.sh
./scripts/fix-encoding.sh
```

**功能:**
- ✅ 安装中文语言包和字体
- ✅ 生成 UTF-8 locale
- ✅ 配置环境变量 (LANG, LC_ALL)
- ✅ 自动添加到 shell 配置文件
- ✅ 配置 Git UTF-8 编码
- ✅ 测试中文显示

### 2. encoding-utils.js - 代码级编码处理

Node.js 字符编码处理工具,可在代码中使用或作为 CLI 工具。

**CLI 使用:**

```bash
# 修复乱码字符串
node scripts/encoding-utils.js decode "ä½\u00a0å¥½"

# 检测字符串编码
node scripts/encoding-utils.js detect "乱码文本"

# 转换编码
node scripts/encoding-utils.js encode "你好" utf8

# 修复文件编码
node scripts/encoding-utils.js fix-file input.txt output.txt
```

**代码中使用:**

```javascript
const { ensureUtf8, fixGarbledText } = require('./scripts/encoding-utils');

// 确保字符串为 UTF-8
const text = ensureUtf8(someString);

// 修复乱码
const fixed = fixGarbledText("ä½\u00a0å¥½");
console.log(fixed); // 输出: 你好
```

## 🔧 在项目中集成

### 方法 1: 在安装脚本中自动配置

已在 `install-wsl.ps1` 中集成,安装时自动配置 UTF-8 编码。

### 方法 2: 在代码中处理编码

```javascript
// 在 Node.js 代码中
process.env.LANG = 'zh_CN.UTF-8';
process.env.LC_ALL = 'zh_CN.UTF-8';

// 确保输出使用 UTF-8
process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');
```

### 方法 3: 在 shell 脚本中设置编码

```bash
#!/bin/bash
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 你的代码...
```

## 📋 常见问题

### Q: 为什么会出现 ??? 乱码?

**A:** 通常是以下原因之一:
1. 系统未安装中文字体
2. locale 未配置为 UTF-8
3. 环境变量 LANG/LC_ALL 未设置
4. 终端不支持 UTF-8

### Q: 如何验证编码是否正确?

**A:** 运行以下命令:

```bash
# 检查 locale
locale

# 测试中文显示
echo "测试中文: 你好世界"

# 检查环境变量
echo $LANG
echo $LC_ALL
```

### Q: 修复后仍有乱码怎么办?

**A:** 尝试以下步骤:
1. 重新打开终端
2. 运行 `source ~/.bashrc`
3. 检查终端模拟器设置 (确保支持 UTF-8)
4. 使用 `encoding-utils.js` 检测具体编码问题

## 🎯 快速修复指南

### Windows PowerShell 调用 WSL

```powershell
# 设置 WSL 输出编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 运行 WSL 命令
wsl -d Ubuntu bash -c "export LANG=zh_CN.UTF-8 && your-command"
```

### 在 TypeScript/JavaScript 中

```typescript
import { spawn } from 'child_process';

const proc = spawn('wsl', ['-d', 'Ubuntu', 'bash', '-c', 'your-command'], {
  env: {
    ...process.env,
    LANG: 'zh_CN.UTF-8',
    LC_ALL: 'zh_CN.UTF-8'
  },
  encoding: 'utf8'
});

proc.stdout.setEncoding('utf8');
proc.stderr.setEncoding('utf8');
```

## 📚 参考资料

- [Ubuntu Locale 配置](https://help.ubuntu.com/community/Locale)
- [Node.js Buffer 编码](https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings)
- [WSL 字符编码问题](https://docs.microsoft.com/en-us/windows/wsl/troubleshooting)
