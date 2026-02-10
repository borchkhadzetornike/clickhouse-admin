import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, ""),
      },
      "/api/gov": {
        target: "http://localhost:4001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gov/, ""),
      },
    },
  },
});
