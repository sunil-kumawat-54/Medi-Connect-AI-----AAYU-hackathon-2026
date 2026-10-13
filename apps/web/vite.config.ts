import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function devCredentialsPlugin() {
  return {
    name: 'dev-demo-credentials-plugin',
    apply: 'serve' as const, // ONLY active in development server (vite dev), excluded from production build
    configureServer(server: any) {
      server.middlewares.use('/api/dev-demo-credentials', (_req: any, res: any) => {
        const secretPath = path.resolve(__dirname, '../../.demo_secret.txt');
        let pw = '';
        if (fs.existsSync(secretPath)) {
          pw = fs.readFileSync(secretPath, 'utf8').trim();
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ password: pw }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devCredentialsPlugin()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
