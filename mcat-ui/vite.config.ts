import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [svelte()],
    server: { port: 5199, strictPort: false },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
