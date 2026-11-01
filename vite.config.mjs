import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4182",
      "/run": "http://127.0.0.1:4182",
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve("index.html"),
        app: resolve("app/index.html"),
        bank: "bank/index.html",
        docs: resolve("docs/index.html"),
      },
    },
  },
});
