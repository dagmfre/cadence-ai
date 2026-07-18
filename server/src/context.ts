/**
 * Per-request workspace scoping. Every signed-in account owns its own workspace;
 * without this, one global `ws:default` key made every account share the same
 * connection, runs and chat.
 *
 * Kept in its own module so both store.ts and workspace.ts can use it without an
 * import cycle. Requests enter a context in an onRequest hook; CLI scripts and the
 * cron trigger run with no context, which is what lets them use the .env workspace.
 *
 * The store is a MUTABLE holder entered via `run()` rather than `enterWith()`:
 * `enterWith` does not survive Fastify's hook→handler transition, so the account
 * id is written into the holder after the (async) session lookup completes.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface Ctx {
  id: string | null;
}

const storage = new AsyncLocalStorage<Ctx>();

/** Run the rest of the request inside a fresh workspace context. */
export function runWithWorkspace<T>(fn: () => T): T {
  return storage.run({ id: null }, fn);
}

/** Bind the active context to an account once its session is resolved. */
export function setWorkspaceId(id: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.id = id;
}

/** The signed-in account's workspace id, or null when running headless (CLI/cron). */
export function currentWorkspaceId(): string | null {
  return storage.getStore()?.id ?? null;
}

/** Redis key prefix. Headless callers get the .env-backed "default" workspace. */
export function workspaceKey(): string {
  return `ws:${currentWorkspaceId() ?? "default"}`;
}
