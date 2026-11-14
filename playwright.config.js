import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./testes",
  testMatch: "loja.spec.js",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4204",
  },
  projects: [
    { name: "celular", use: { ...devices["Pixel 5"] } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "notebook", use: { viewport: { width: 1366, height: 768 } } },
    { name: "ultrawide", use: { viewport: { width: 2560, height: 1440 } } },
  ],
});
