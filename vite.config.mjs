import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
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
