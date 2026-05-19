import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // Expose VITE_* env vars via process.env so services using process.env work in both Jest and Vite
    const processEnvDefines: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('VITE_')) {
            processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
        }
    }
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      define: processEnvDefines,
    };
});
