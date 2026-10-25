import { defineConfig, devices } from "@playwright/test";

/** End-to-end tests in test/e2e against the dev server on 8796 (reused when it already runs). */
const url = "http://127.0.0.1:8796";
export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: { command: "npx next dev -H 127.0.0.1 -p 8796", url, reuseExistingServer: true, timeout: 60_000 },
});
