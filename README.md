# Clawdbot WeChat Plugin & Bridge

Clawdbot 的微信公众号连接套件。支持通过微信公众号与 Clawdbot 智能体进行交互。

> [!IMPORTANT]
> **使用门槛声明**
> 本插件仅支持 **非个人认证的公众号**（如服务号、企业认证订阅号）。由于微信接口权限限制，个人认证的公众号无法使用客服消息接口进行回复。

> [!TIP]
> **商业合作**
> 如果您需要商用授权、技术支持或定制开发，请联系：**nomorelighthouse@gmail.com**

## 架构说明

本套件由两部分组成：
1. **WeChat Bridge**: 一个独立运行的服务（通常使用 Docker 部署），负责接收微信服务器的消息，并转发给 Clawdbot。
2. **WeChat Plugin**: 安装在 Clawdbot 上的插件，负责接收 Bridge 的转发并处理智能体回复。

---

## 👨‍💻 对于 Clawdbot 用户

如果您是 Clawdbot 的使用者，希望让自己的智能体接入微信，请按照以下步骤操作：

### 1. 安装插件

在您的 Clawdbot 目录或工作区中安装此插件：

```bash
clawdbot plugins install @haiyanfengli-llc/webhook-server
# 或者如果是源码安装
clawdbot plugins install -l ./clawdbot-plugin-webhook-server
```

### 2. 配置插件



编辑 Clawdbot 配置文件 (`clawdbot.json`)，启用微信频道：

```json
{
  "channels": {
    "wechat": {
      "enabled": true,
      "config": {
        "callbackUrl": "http://your-bridge-host:3000/callback" 
      }
    }
  }
}
```
*注意：`callbackUrl` 为可选配置，如果您的 Bridge 无法自动识别回调地址，可以在此手动指定。*

### 2.5 (可选) 启用 Ngrok 内网穿透

如果您在本地开发或无公网 IP 的环境下运行 Clawdbot，可以使用内置的 ngrok 集成将服务暴露到公网。

在 `plugins` 配置中启用：

```json
{
  "plugins": {
    "entries": {
      "webhook-server": {
        "enabled": true,
        "config": {
          "useNgrok": true,
          "ngrokAuthToken": "您的_NGROK_AUTHTOKEN", 
          "ngrokPort": 18789,
          "ngrokRegion": "us"
        }
      }
    }
  }
}
```
*注意：`ngrokAuthToken` 可选，优先读取系统环境变量 `NGROK_AUTHTOKEN`。`ngrokPort` 需与 Clawdbot 端口一致。*

启用后，Clawdbot 启动时会在日志中输出生成的公网 URL，请使用该 URL 进行绑定。
```

### 3. 获取连接信息

插件启动后，您的 Webhook 地址通常为 Clawdbot 的主服务地址加上 `/webhook`。
例如：`http://<您的ClawdbotIP>:<端口>/webhook`

您还需要一个 **Auth Token** 来保障安全。插件会自动为您生成一个，您可以在 Clawdbot 启动日志中找到，或者在配置文件中手动指定一个。

将 **Webhook 地址** 和 **Token** 提供给公众号维护者进行绑定。

---

## 🛠 对于公众号维护者

如果您负责维护微信公众号和 Bridge 服务，请按照以下步骤部署：

### 1. 部署 WeChat Bridge

推荐使用 Docker Compose 部署 Bridge 服务。

`docker-compose.yml`:

```yaml
version: '3.8'
services:
  bridge:
    image: clawdbot/wechat-bridge:latest # 或者自行构建
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - WECHAT_APPID=您的AppID
      - WECHAT_APPSECRET=您的AppSecret
      - WECHAT_TOKEN=您的Token # 对应微信后台的 Token
      - WECHAT_ENCODING_AES_KEY=您的EncodingAESKey # 对应微信后台的 EncodingAESKey
      - BRIDGE_BASE_URL=http://您的服务器IP:3000 # Bridge 的公网地址
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
```

### 2. 配置微信后台

登录微信公众平台 -> 设置与开发 -> 基本配置：
*   **URL (服务器地址)**: `http://您的Bridge服务器IP:3000/wechat`
*   **Token**: 与 `docker-compose.yml` 中的 `WECHAT_TOKEN` 一致
*   **EncodingAESKey**: 与 `docker-compose.yml` 中的 `WECHAT_ENCODING_AES_KEY` 一致
*   **消息加解密方式**: 推荐使用安全模式

### 3. 绑定 Clawdbot 实例

Bridge 部署成功后，用户就可以在微信公众号中发送指令来绑定 Clawdbot 了。

**绑定指令格式：**
```
bind <Clawdbot的Webhook地址> <Clawdbot的Token>
```

**示例：**
如果用户的 Clawdbot 运行在 `http://47.253.xx.xx:8789`，Token 是 `abc123456`，则在公众号发送：

```
bind http://47.253.xx.xx:8789/webhook abc123456
```

绑定成功后，即可直接对话。

---

## 常见问题

**Q: 为什么发送消息没有回复？**
A:
1. 检查公众号类型是否为非个人认证。
2. 检查 Clawdbot 的 `config.yaml` 中是否启用了 `wechat` channel。
3. 检查绑定指令中的端口是否正确（应为 Clawdbot 主服务端口）。

**Q: 如何解除绑定？**
A: 在公众号发送 `unbind` 即可。

**Q: 日志显示 ECONNREFUSED？**
A: 通常是因为 Bridge 尝试连接的 Clawdbot 地址或端口不正确。请确保 `bind` 指令中使用的是 Clawdbot 实际监听的端口（如 8789 而不是旧版的 8765）。
