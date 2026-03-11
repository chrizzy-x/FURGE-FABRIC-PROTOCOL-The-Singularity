import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 60_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:3100"
  }
});