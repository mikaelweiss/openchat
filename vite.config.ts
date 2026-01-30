import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [wasm(), topLevelAwait(), react()],

  // Add optimizations for WASM and dependency handling
  optimizeDeps: {
    exclude: ['tiktoken', '@anthropic-ai/tokenizer'],
    esbuildOptions: {
      target: 'es2022',
    }
  },
  
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'tiktoken': ['tiktoken'],
          'anthropic': ['@anthropic-ai/tokenizer']
        }
      }
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
