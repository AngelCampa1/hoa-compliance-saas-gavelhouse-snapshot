import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { fileURLToPath } from "node:url";
import { getNoindexPaths } from "./src/lib/noindex-paths.ts";
import { createSitemapSerializer } from "./src/lib/sitemap-utils.ts";
import { indexNowIntegration } from "./src/lib/indexnow-integration.ts";
import { sitemapDatesIntegration } from "./src/lib/sitemap-dates-integration.ts";
import { PUBLIC_WEB_URL } from "@boardstack/shared";

// Dynamically built at build time — reads frontmatter from all content
// collection .md files and collects paths where noindex: true is set.
const noindexPages = getNoindexPaths();
const enableIndexNowSubmit = process.env["ENABLE_INDEXNOW_SUBMIT"] === "true";
const aiDiscoveryPages = [
  `${PUBLIC_WEB_URL}/llms.txt`,
  `${PUBLIC_WEB_URL}/llms-full.txt`,
  `${PUBLIC_WEB_URL}/pricing.txt`,
];
const sentryRelease =
  process.env["PUBLIC_SENTRY_RELEASE"] ?? process.env["SENTRY_RELEASE"];
const shouldUploadSentrySourceMaps = Boolean(
  process.env["SENTRY_AUTH_TOKEN"] &&
  process.env["SENTRY_ORG"] &&
  process.env["SENTRY_PROJECT"] &&
  sentryRelease,
);

export default defineConfig({
  site: PUBLIC_WEB_URL,
  output: "static",
  trailingSlash: "always",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    react(),
    sitemap({
      customPages: aiDiscoveryPages,
      filter: (page) => {
        const path = new URL(page).pathname;
        const isPaginatedHubPage =
          /^\/(compare\/(alternatives|pricing|versus)|hoa-compliance|product|resources\/(best|guides)|solutions)\/\d+\/?$/.test(
            path,
          );
        return !noindexPages.has(path) && !isPaginatedHubPage;
      },
      serialize: createSitemapSerializer(),
    }),
    indexNowIntegration({
      enabled: enableIndexNowSubmit,
      key: "6a926d77c67922e5a7a0160793c946fa",
    }),
    sitemapDatesIntegration(),
  ],
  vite: {
    plugins: [
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
    build: {
      sourcemap: shouldUploadSentrySourceMaps,
    },
    resolve: {
      alias: {
        "@/config/site": fileURLToPath(
          new URL("./src/config/site.ts", import.meta.url),
        ),
        "@/config/hub-faqs": fileURLToPath(
          new URL("./src/config/hub-faqs.ts", import.meta.url),
        ),
        "@/lib/breadcrumbs": fileURLToPath(
          new URL("./src/lib/site-breadcrumbs.ts", import.meta.url),
        ),
        "@/lib/comparison-rows": fileURLToPath(
          new URL("./src/lib/comparison-rows.ts", import.meta.url),
        ),
        "@/lib/page-helpers": fileURLToPath(
          new URL("./src/lib/page-helpers.ts", import.meta.url),
        ),
      },
    },
  },
  server: {
    port: 3061,
  },
});
