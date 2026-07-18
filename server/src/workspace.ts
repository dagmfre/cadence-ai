/**
 * Workspace config layer (PRODUCT_FLOWS §0): one team's connection set, stored
 * in Redis (`ws:default:config`) with env fallback — so the wizard can drive
 * the pipeline, while everything keeps working from .env alone. Consumers call
 * getWorkspace() lazily (10s cache); saveWorkspace() invalidates.
 */
import { z } from "zod";
import { store } from "./store.js";

export const AutonomySchema = z.enum(["observe", "copilot", "autopilot"]);

export const WorkspaceConfigSchema = z.object({
  githubToken: z.string(),
  githubLogin: z.string(),
  repo: z.string(), // "owner/name"
  projectNumber: z.number(),
  slackBotToken: z.string(),
  slackChannelId: z.string(),
  teamMap: z.record(z.string(), z.string()),
  autonomy: AutonomySchema,
}).partial();
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

/** Resolved view: saved config over env, with defaults applied. */
export interface Workspace {
  githubToken: string;
  githubLogin?: string;
  repo: string;
  projectNumber: number;
  slackBotToken?: string;
  slackChannelId?: string;
  teamMap: Record<string, string>;
  autonomy: z.infer<typeof AutonomySchema>;
}

let cache: { ws: Workspace; at: number } | null = null;

export async function getWorkspace(): Promise<Workspace> {
  if (cache && Date.now() - cache.at < 10_000) return cache.ws;
  const parsed = WorkspaceConfigSchema.safeParse(await store.getConfig());
  const saved: WorkspaceConfig = parsed.success ? parsed.data : {};
  const e = process.env;
  const ws: Workspace = {
    githubToken: saved.githubToken ?? e.GITHUB_TOKEN_CLASSIC ?? e.GITHUB_TOKEN ?? "",
    githubLogin: saved.githubLogin,
    repo: saved.repo ?? e.TARGET_REPO ?? "",
    projectNumber: saved.projectNumber ?? Number(e.PROJECT_NUMBER ?? 2),
    slackBotToken: saved.slackBotToken ?? e.SLACK_BOT_TOKEN,
    slackChannelId: saved.slackChannelId ?? e.SLACK_CHANNEL_ID,
    teamMap: saved.teamMap ?? JSON.parse(e.TEAM_MAP ?? "{}"),
    autonomy: saved.autonomy ?? AutonomySchema.catch("copilot").parse(e.AUTONOMY),
  };
  cache = { ws, at: Date.now() };
  return ws;
}

export async function saveWorkspace(patch: WorkspaceConfig): Promise<void> {
  const parsed = WorkspaceConfigSchema.safeParse(await store.getConfig());
  await store.setConfig({ ...(parsed.success ? parsed.data : {}), ...patch });
  cache = null;
}
