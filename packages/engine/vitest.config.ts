import { defineConfig } from "vitest/config";

// Random order, so no test can lean on another running first (sm_ conventions).
export default defineConfig({ test: { sequence: { shuffle: true } } });
