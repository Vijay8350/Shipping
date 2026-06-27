import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    // The Remix web process sits behind Nginx/ALB in production (see CLAUDE.md §4).
    allowedHosts: true,
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/*.css", "**/*.test.{ts,tsx}"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: true,
        v3_routeConfig: false,
      },
    }),
  ],
});
