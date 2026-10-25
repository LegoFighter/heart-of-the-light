import { defineConfig } from "vitest/config";

/** Unit tests: test/*.test.ts, in node. */
export default defineConfig({
  test: {
    include: ["test/*.test.ts"],
    environment: "node",
  },
});
