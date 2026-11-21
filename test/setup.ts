import { afterEach, expect, vi } from "vitest";

const realSetTimeout = globalThis.setTimeout;
const stubbedGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
const stubbedEnvs = new Map<string, string | undefined>();

Object.assign(vi, {
  stubGlobal(name: PropertyKey, value: unknown) {
    if (!stubbedGlobals.has(name)) {
      stubbedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return vi;
  },
  unstubAllGlobals() {
    for (const [name, original] of stubbedGlobals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
    stubbedGlobals.clear();
    return vi;
  },
  stubEnv(name: string, value: string | undefined) {
    if (!stubbedEnvs.has(name)) stubbedEnvs.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    return vi;
  },
  unstubAllEnvs() {
    for (const [name, original] of stubbedEnvs) {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
    stubbedEnvs.clear();
    return vi;
  },
  hoisted<T>(factory: () => T): T {
    return factory();
  },
  mocked<T>(item: T): T {
    return item;
  },
  async waitFor<T>(
    callback: () => T | Promise<T>,
    options: number | { timeout?: number; interval?: number } = {},
  ) {
    const { timeout = 1000, interval = 50 } =
      typeof options === "number" ? { timeout: options } : options;
    const deadline = Date.now() + timeout;
    for (;;) {
      try {
        return await callback();
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => realSetTimeout(resolve, interval));
      }
    }
  },
});

Object.assign(expect, {
  fail(message?: string): never {
    return expect.unreachable(message);
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
