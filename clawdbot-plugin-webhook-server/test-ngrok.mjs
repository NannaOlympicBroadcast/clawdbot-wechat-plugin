import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load the built module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist', 'index.js');

try {
    const module = await import('file://' + distPath);
    const plugin = module.default;

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

    // Give it 5 seconds to try connecting
    // If ngrok fails (e.g. no auth arg), it should log error
    setTimeout(() => {
        console.log('Test completed.');
        process.exit(0);
    }, 5000);

} catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
}
