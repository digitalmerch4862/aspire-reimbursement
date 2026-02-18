import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GOOGLE_API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
        'process.env.MINIMAX_API_KEY': JSON.stringify(env.MINIMAX_API_KEY),
        'process.env.KIMI_API_KEY': JSON.stringify(env.KIMI_API_KEY || env.MOONSHOT_API_KEY),
        'process.env.MOONSHOT_API_KEY': JSON.stringify(env.MOONSHOT_API_KEY),
        'process.env.GLM_API_KEY': JSON.stringify(env.GLM_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
