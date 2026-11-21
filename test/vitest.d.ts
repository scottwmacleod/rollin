/// <reference types="bun" />

declare module "vitest" {
  export * from "bun:test";
  import type { expect as bunExpect, vi as bunVi } from "bun:test";

  type WaitForOptions = number | { timeout?: number; interval?: number };

  export const expect: typeof bunExpect & { fail(message?: string): never };

  export const vi: typeof bunVi & {
    stubGlobal(name: PropertyKey, value: unknown): typeof vi;
    unstubAllGlobals(): typeof vi;
    stubEnv(name: string, value: string | undefined): typeof vi;
    unstubAllEnvs(): typeof vi;
    hoisted<T>(factory: () => T): T;
    mocked<T>(item: T): T;
    waitFor<T>(callback: () => T | Promise<T>, options?: WaitForOptions): Promise<T>;
  };
}
