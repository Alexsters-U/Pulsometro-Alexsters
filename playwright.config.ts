import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:18764", channel: process.env.PLAYWRIGHT_CHANNEL, screenshot: "only-on-failure" },
  webServer: {
    command: "node --import tsx tests/ui-server.ts",
    url: "http://127.0.0.1:18764/api/health",
    reuseExistingServer: false,
  },
});
