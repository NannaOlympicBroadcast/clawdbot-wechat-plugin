import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { closeRedis } from './services/redis.js';

async function main() {
    // Load configuration
    const config = loadConfig();

    console.log('Starting Clawdbot WeChat Bridge...');
    console.log(`  WeChat AppID: ${config.wechat.appId.slice(0, 6)}...`);
    console.log(`  Bridge URL: ${config.bridge.baseUrl}`);
    console.log(`  Redis URL: ${config.redis.url}`);

    // Build and start the Fastify app
    const app = buildApp();

    try {
        await app.listen({ port: config.port, host: config.host });
        console.log(`Server listening on http://${config.host}:${config.port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down...');
        await app.close();
        await closeRedis();
        console.log('Goodbye!');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();
