# Clawdbot WeChat Bridge

微信公众号与 Clawdbot 的桥接服务，支持多租户消息路由。

## 功能特性

- 🔐 微信消息签名校验
- 📱 支持多用户绑定不同的 Clawdbot 实例
- ⚡ 异步消息处理，避免微信 5 秒超时
- 📨 通过客服消息接口发送回复
- 🔄 AccessToken 自动刷新与缓存
- 🐳 Docker 支持

## 架构流程

```
WeChat User → WeChat Server → Bridge → Clawdbot Instance
                                ↓
                              Redis (用户绑定关系)
                                ↓
                         <- Customer Service API
```

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 2. 使用 Docker Compose 启动

```bash
docker-compose up -d
```

### 3. 配置微信公众号

在微信公众平台配置服务器：
- URL: `https://your-domain.com/wechat`
- Token: 与 `.env` 中的 `WECHAT_TOKEN` 一致
- EncodingAESKey: 可选

## 用户使用指南

### 绑定 Clawdbot

用户关注公众号后，发送以下消息绑定自己的 Clawdbot 实例：

```
bind https://your-clawdbot.example.com/webhook your-secret-token
```

### 解除绑定

```
unbind
```

### 使用 Clawdbot

绑定后，直接发送消息即可与你的 Clawdbot 对话。

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/wechat` | 微信服务器验证 |
| POST | `/wechat` | 接收微信消息 |
| POST | `/callback/:openid` | Clawdbot 回调 |
| GET | `/health` | 健康检查 |

## Clawdbot Webhook 协议

Bridge 发送给 Clawdbot 的请求格式：

```json
{
  "task": "用户发送的消息内容",
  "callback_url": "https://bridge.example.com/callback/{openid}",
  "metadata": {
    "openid": "用户OpenID",
    "msg_type": "text",
    "msg_id": "消息ID",
    "timestamp": 1234567890
  }
}
```

Clawdbot 应向 `callback_url` POST 处理结果：

```json
{
  "success": true,
  "result": "处理结果文本",
  "metadata": {
    "thinking_time_ms": 1500
  }
}
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 生产运行
npm start

# 测试
npm test
```

## 环境变量

| 变量 | 必填 | 描述 |
|------|------|------|
| `WECHAT_APPID` | ✅ | 公众号 AppID |
| `WECHAT_APPSECRET` | ✅ | 公众号 AppSecret |
| `WECHAT_TOKEN` | ✅ | 服务器配置 Token |
| `BRIDGE_BASE_URL` | ✅ | Bridge 公网访问地址 |
| `REDIS_URL` | ❌ | Redis 连接地址，默认 `redis://localhost:6379` |
| `PORT` | ❌ | 服务端口，默认 `3000` |

## 注意事项

1. **客服消息权限**: 需要在微信公众平台开启客服消息功能
2. **HTTPS**: 微信要求服务器地址使用 HTTPS
3. **消息长度**: 客服消息限制 600 字符，超长消息会自动分段发送

## License

MIT
