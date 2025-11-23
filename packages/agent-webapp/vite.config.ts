
import process from 'node:process';
import { defineConfig } from 'vite';

// Expose environment variables to the client
const burgerApiUrl = process.env.BURGER_API_URL || 'http://localhost:7071';

console.log(`Using burger API base URL: "${burgerApiUrl}"`);

export default defineConfig({
  base: '/',
  define: {
    // CRITICAL: Always set VITE_API_URL to empty string for the build.
    // This ensures the frontend uses relative paths (e.g. /api/chats),
    // allowing the Static Web App proxy to inject authentication headers.
    'import.meta.env.VITE_API_URL': JSON.stringify(''),
    'import.meta.env.VITE_BURGER_API_URL': JSON.stringify(burgerApiUrl),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:7071',
    },
  },
});