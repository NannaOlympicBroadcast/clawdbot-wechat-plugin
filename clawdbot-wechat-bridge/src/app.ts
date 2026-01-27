import Fastify, { FastifyInstance } from 'fastify';
import { wechatRoutes } from './routes/wechat.js';
import { callbackRoutes } from './routes/callback.js';

export function buildApp(): FastifyInstance {
    const isDevelopment = process.env.NODE_ENV === 'development';

    const app = Fastify({
        logger: isDevelopment
            ? {
                level: process.env.LOG_LEVEL || 'info',
                transport: {
                    target: 'pino-pretty',
                    options: {
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                    },
                },
            }
            : {
                level: process.env.LOG_LEVEL || 'info',
            },
    });

    // Register content type parser for XML
    app.addContentTypeParser(
        ['text/xml', 'application/xml'],
        { parseAs: 'string' },
        (req, body, done) => {
            done(null, body);
        }
    );

    // Health check endpoint
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Register routes
    app.register(wechatRoutes);
    app.register(callbackRoutes);

    // Error handler
    app.setErrorHandler((error, request, reply) => {
        app.log.error(error);
        reply.status(500).send({
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    });

    return app;
}
