declare const __APP_VERSION__: string;

declare module "*/sm-posthog.js" {
  export function startPostHog(config: {
    token: string;
    product: string;
    host?: string;
    flags?: boolean;
    options?: Record<string, unknown>;
    idleMs?: number;
  }): void;
  export function flag(key: string): string | boolean | undefined;
  export function onFlags(cb: () => void): () => void;
  export function captureException(error: unknown, properties?: Record<string, unknown>): void;
  export function capture(event: string, properties?: Record<string, unknown>): void;
}
