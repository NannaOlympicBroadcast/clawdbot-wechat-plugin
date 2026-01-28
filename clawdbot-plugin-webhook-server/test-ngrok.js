const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock the peer dependency
Module.prototype.require = function (path) {
    if (path === 'clawdbot/plugin-sdk') {
        console.log('Mocking clawdbot/plugin-sdk');
        return {
            DEFAULT_ACCOUNT_ID: 'default',
            buildChannelConfigSchema: (s) => s,
            emptyPluginConfigSchema: () => ({}),
            normalizeAccountId: (id) => id
        };
    }
    return originalRequire.apply(this, arguments);
};

const path = require('path');

// Load the built module
const pluginPath = path.join(__dirname, 'dist', 'index.js');
console.log('Loading plugin from:', pluginPath);
const plugin = require(pluginPath).default;

console.log('Plugin loaded:', plugin.id);

const mockApi = {
    runtime: {},
    config: {
        plugins: {
            entries: {
                'webhook-server': {
                    config: {
                        useNgrok: true,
                        ngrokPort: 8765
                    }
                }
            }
        },
        channels: {
            wechat: { config: {} }
        }
    },
    logger: {
        info: (msg) => console.log('INFO:', msg),
        warn: (msg) => console.log('WARN:', msg),
        error: (msg) => console.log('ERROR:', msg),
    },
    registerChannel: () => { },
    registerHttpHandler: () => { }
};

console.log('Registering plugin...');
plugin.register(mockApi);

// Give it 5 seconds
setTimeout(() => {
    console.log('Test completed.');
    process.exit(0);
}, 5000);
