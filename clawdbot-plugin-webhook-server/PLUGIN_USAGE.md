# Clawdbot WeChat Channel Plugin

Connect your Clawdbot agent to WeChat Official Accounts.

**This plugin is part of the Clawdbot WeChat Integration Suite.**
For full source code, issues, and bridge deployment guide, please visit our GitHub repository:
👉 **[https://github.com/NannaOlympicBroadcast/clawdbot-wechat-plugin](https://github.com/NannaOlympicBroadcast/clawdbot-wechat-plugin)**

---

## 🚀 Installation

Install the plugin from NPM:

```bash
clawdbot plugins install @haiyanfengli-llc/webhook-server
```

## ⚙️ Configuration

Add the following configuration to your Clawdbot `clawdbot.json`:

```json
{
  "channels": {
    "wechat": {
      "enabled": true,
      "config": {
        "callbackUrl": "http://<bridge-host>:3000/callback"
      }
    }
  },
  "plugins": {
    "entries": {
      "webhook-server": {
        "enabled": true,
        "config": {
          "useNgrok": false,
          "ngrokAuthToken": "...",
          "ngrokPort": 18789,
          "ngrokRegion": "us"
        }
      }
    }
  }
}
```
*Note: `callbackUrl` is optional. `ngrokAuthToken` is optional if `NGROK_AUTHTOKEN` env var is set.*

### Ngrok Integration

This plugin has built-in support for [ngrok](https://ngrok.com/) to expose your local server to the internet. This is useful for development or self-hosted environments without a public IP.

1.  Sign up for an ngrok account and get your Authtoken.
2.  Set `useNgrok: true` in your configuration.
3.  Provide the authtoken via `NGROK_AUTHTOKEN` environment variable (Recommended) or `ngrokAuthToken` in config.
    *   **Note:** The `NGROK_AUTHTOKEN` environment variable takes precedence over the configuration file.
4.  Check the logs on startup for the generated public URL.


## 🔗 Architecture

This plugin requires the **WeChat Bridge** service to function.
The bridge handles the communication with WeChat servers and forwards messages to this plugin.

1.  **WeChat** sends message to **Bridge**.
2.  **Bridge** forwards message to **Clawdbot Plugin**.
3.  **Clawdbot Agent** processes message.
4.  **Clawdbot Plugin** sends reply back to **Bridge**.
5.  **Bridge** sends reply to **WeChat**.

Please refer to the [GitHub Repository](https://github.com/NannaOlympicBroadcast/clawdbot-wechat-plugin) for instructions on how to deploy the Bridge.

## 📋 Requirements

*   Clawdbot v0.5.0 or later
*   Self-hosted WeChat Bridge
*   WeChat Service Account (服务号) or verified Subscription Account (认证订阅号)

## 🤝 Commercial Support

For commercial usage, verified builds, or enterprise support, please contact:
📧 **nomorelighthouse@gmail.com**
