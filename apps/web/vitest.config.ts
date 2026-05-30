import { defineConfig } from "vitest/config";

// Mirror the Astro `preact({ compat: true })` aliasing so React-based libraries
// (e.g. zustand) resolve to preact/compat when tests run under Node.
export default defineConfig({
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
  test: {
    server: {
      deps: {
        inline: ["zustand"],
      },
    },
  },
});
