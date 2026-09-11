import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const githubPages = mode === "github-pages";
  return {
    plugins: [react()],
    base: githubPages ? process.env.GITHUB_PAGES_BASE || "/" : "/",
    // Public builds only accept explicitly supplied browser keys, never .env.local.
    envDir: githubPages ? ".github/pages-env" : ".",
    build: {
      outDir: githubPages ? "dist-github" : "dist"
    },
    optimizeDeps: {
      exclude: ["maplibre-gl"]
    },
    server: {
      port: 5173
    },
    preview: {
      port: 4173
    }
  };
});
