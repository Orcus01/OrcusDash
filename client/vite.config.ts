import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // reachable from phones on the same Wi-Fi
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:2567', ws: true },
    },
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Vendor chunks change rarely, so browsers keep them cached between deploys.
        manualChunks: { three: ['three'], physics: ['@dimforge/rapier3d-compat'] },
      },
    },
  },
});
