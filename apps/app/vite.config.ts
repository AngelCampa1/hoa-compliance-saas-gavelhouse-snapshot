import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

const buildCommit = process.env["VITE_BUILD_COMMIT"] ?? "dev";

function buildCommitHtmlPlugin(commit: string): Plugin {
  return {
    name: "boardstack-build-commit-html",
    transformIndexHtml(html) {
      return html.replaceAll("%VITE_BUILD_COMMIT%", commit);
    },
  };
}

const sentryRelease =
  process.env["VITE_SENTRY_RELEASE"] ?? process.env["SENTRY_RELEASE"];
const shouldUploadSentrySourceMaps = Boolean(
  process.env["SENTRY_AUTH_TOKEN"] &&
  process.env["SENTRY_ORG"] &&
  process.env["SENTRY_PROJECT"] &&
  sentryRelease,
);

export default defineConfig({
  plugins: [
    buildCommitHtmlPlugin(buildCommit),
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    ...(shouldUploadSentrySourceMaps
      ? sentryVitePlugin({
          authToken: process.env["SENTRY_AUTH_TOKEN"],
          org: process.env["SENTRY_ORG"],
          project: process.env["SENTRY_PROJECT"],
          release: { name: sentryRelease },
          sourcemaps: { filesToDeleteAfterUpload: "dist/**/*.map" },
          telemetry: false,
        })
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildCommit),
  },
  build: {
    sourcemap: shouldUploadSentrySourceMaps,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          const normalizedId = id.replace(/\\/g,"/");
          const packagePath = normalizedId.split("node_modules/").pop() ?? "";

          if (
            packagePath.startsWith("react/") ||
            packagePath.startsWith("react-dom/") ||
            packagePath.startsWith("scheduler/")
          ) {
            return "react-vendor";
          }

          if (packagePath.startsWith("@tanstack/")) {
            return "tanstack";
          }

          if (packagePath.startsWith("@radix-ui/")) {
            return "radix";
          }

          if (packagePath.startsWith("@sentry/")) {
            return "observability";
          }

          if (packagePath.startsWith("posthog-js/")) {
            return "analytics";
          }

          if (packagePath.startsWith("better-auth/")) {
            return "auth";
          }

          if (
            packagePath.startsWith("recharts/") ||
            packagePath.startsWith("d3-")
          ) {
            return "charts";
          }

          return "vendor";
        },
      },
    },
  },
  server: { port: 3060 },
  preview: { port: 3060 },
});
