/**
 * Minimal ambient declarations for the Cloudflare Workers runtime bindings this
 * worker uses.
 *
 * The full `@cloudflare/workers-types` package would be more complete, but it is not
 * a dependency of this project and pulling it in changes the global `lib` for the
 * React app too. These few shapes are all `worker/` touches, and having them means
 * `npm run typecheck:worker` can actually check the worker instead of silently
 * skipping it (the main tsconfig only includes `src`).
 */

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: { changes?: number; [key: string]: unknown };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
