# Clawdbot Webhook Server Plugin

A Clawdbot plugin that exposes an HTTP webhook server for receiving external messages (like from WeChat bridges) and processing them through the Clawdbot agent.

## Installation

```bash
clawdbot plugins install @clawdbot/webhook-server
# or from local directory
clawdbot plugins install -l ./clawdbot-plugin-webhook-server
```

## Configuration

Add to your Clawdbot config (`~/.clawdbot/config.yaml` or workspace `.clawdbot/config.yaml`):

```yaml
plugins:
  entries:
    webhook-server:
      enabled: true
      config:
        port: 8765
        host: 0.0.0.0
        authToken: your-secret-token-here
        timeout: 300000  # 5 minutes
```

## API Endpoints

### POST /webhook

Receive and process a task.

**Headers:**
- `Authorization: Bearer <authToken>` (required if authToken is configured)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "task": "The message/task to process",
  "callback_url": "https://your-service.com/callback/user123",
  "metadata": {
    "openid": "user-identifier",
    "msg_type": "text",
    "custom_field": "any additional data"
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "message": "Task queued for processing"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "plugin": "webhook-server"
}
```

## Callback Payload

When the task completes, the plugin will POST to your `callback_url`:

**Success:**
```json
{
  "success": true,
  "result": "The agent's response text",
  "metadata": {
    "thinking_time_ms": 1500,
    "model": "claude-3-opus"
  }
}
```

**Failure:**
```json
{
  "success": false,
  "error": "Error message",
  "metadata": {
    "thinking_time_ms": 500
  }
}
```

## Commands

- `/webhook-status` - Show the webhook server status

## RPC Methods

- `webhook-server.status` - Get server status programmatically

## Usage with WeChat Bridge

This plugin is designed to work with `clawdbot-wechat-bridge`:

1. Configure both services with matching `authToken`
2. Set the bridge's CLAWDBOT_ENDPOINT to point to this webhook server
3. Messages from WeChat will flow through:
   ```
   WeChat → Bridge → Webhook Plugin → Clawdbot Agent → Callback → Bridge → WeChat
   ```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Link for development
clawdbot plugins install -l .
```

## Security Notes

- Always set a strong `authToken` in production
- Use HTTPS in production environments
- Restrict which IPs can access the webhook endpoint (via firewall/reverse proxy)

## License

MIT
