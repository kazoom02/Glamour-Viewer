// @ts-nocheck
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'renderer-three'
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'bone-logger',
      configureServer(server) {
        server.middlewares.use('/api/bones', (req, res) => {
          let body = '';
          req.on('data', chunk => body += chunk.toString());
          req.on('end', () => {
            fs.writeFileSync('bones.txt', body);
            res.end('ok');
          });
        });
      }
    }
  ],
})
