/**
 * Workspace state store (DECISIONS §3, §11): Upstash Redis over HTTP.
 * Falls back to in-memory when Upstash env is absent (local dev before clickops)
 * so nothing blocks — the fallback loses state on restart and says so once.
 */
import { Redis } from "@upstash/redis";
import { ActionPlanSchema, ScanResult } from "./model.js";
import { z } from "zod";

const WS = "ws:default";

export const PendingActionSchema = z.object({
  id: z.string(),
  kind: z.enum(["label", "comment", "dm"]),
  itemNumber: z.number().optional(),
  githubLogin: z.string().optional(),
  value: z.string(),
  createdAt: z.string(),
  status: z.enum(["pending", "approved", "dismissed"]),
});
export type PendingAction = z.infer<typeof PendingActionSchema>;

/** One message in a persisted conversation (D15) — same shape for web + Slack threads. */
export interface ConvoMessage {
  role: "user" | "assistant";
  text: string;
  ts: string;
  /** Action the agent proposed in this message; executed on user confirmation. */
  proposedAction?: Omit<PendingAction, "id" | "createdAt" | "status">;
  /** Set once the proposal was executed (so it can't fire twice). */
  executed?: boolean;
}

export interface RunRecord {
  id: string;
  at: string;
  trigger: "daily" | "manual";
  forecast: ScanResult["forecast"];
  findingCount: number;
  report: string;
  applied: string[]; // human-readable log of executed actions
}

const mem = new Map<string, unknown>();
const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = hasUpstash ? Redis.fromEnv() : null;
if (!redis) console.warn("⚠ Upstash env missing — using in-memory store (state lost on restart).");

async function get<T>(key: string): Promise<T | null> {
  return redis ? ((await redis.get<T>(key)) ?? null) : ((mem.get(key) as T) ?? null);
}
async function set(key: string, value: unknown): Promise<void> {
  if (redis) await redis.set(key, value);
  else mem.set(key, value);
}

export const store = {
  // ---- accounts & sessions (auth.ts owns the crypto) ----
  async getUser(email: string): Promise<{ email: string; passwordHash: string; createdAt: string } | null> {
    return get(`user:${email}`);
  },
  async setUser(email: string, user: { email: string; passwordHash: string; createdAt: string }) {
    await set(`user:${email}`, user);
  },
  async getSession(token: string): Promise<{ email: string; expiresAt: string } | null> {
    return get(`session:${token}`);
  },
  async setSession(token: string, session: { email: string; expiresAt: string }) {
    await set(`session:${token}`, session);
  },
  async deleteSession(token: string) {
    if (redis) await redis.del(`session:${token}`);
    else mem.delete(`session:${token}`);
  },

  /** Raw workspace config record; workspace.ts owns the schema (avoids an import cycle). */
  async getConfig(): Promise<unknown> {
    return get<unknown>(`${WS}:config`);
  },
  async setConfig(config: unknown) {
    await set(`${WS}:config`, config);
  },
  async getPending(): Promise<PendingAction[]> {
    return (await get<PendingAction[]>(`${WS}:pending`)) ?? [];
  },
  async setPending(actions: PendingAction[]) {
    await set(`${WS}:pending`, actions);
  },
  async addRun(run: RunRecord) {
    const runs = (await get<RunRecord[]>(`${WS}:runs`)) ?? [];
    runs.unshift(run);
    await set(`${WS}:runs`, runs.slice(0, 50));
  },
  async getRuns(): Promise<RunRecord[]> {
    return (await get<RunRecord[]>(`${WS}:runs`)) ?? [];
  },
  async getLastScan(): Promise<ScanResult | null> {
    return get<ScanResult>(`${WS}:lastScan`);
  },
  async setLastScan(r: ScanResult) {
    await set(`${WS}:lastScan`, r);
  },
  async getConvo(convoId: string): Promise<ConvoMessage[]> {
    return (await get<ConvoMessage[]>(`${WS}:convo:${convoId}`)) ?? [];
  },
  async setConvo(convoId: string, messages: ConvoMessage[]) {
    await set(`${WS}:convo:${convoId}`, messages);
  },
  async listConvoIds(): Promise<string[]> {
    return (await get<string[]>(`${WS}:convos`)) ?? [];
  },
  async trackConvoId(convoId: string) {
    const ids = await this.listConvoIds();
    if (!ids.includes(convoId)) await set(`${WS}:convos`, [...ids, convoId]);
  },
};
