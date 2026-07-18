/**
 * Workspace config layer (PRODUCT_FLOWS §0): one team's connection set, stored
 * in Redis (`ws:default:config`) with env fallback — so the wizard can drive
 * the pipeline, while everything keeps working from .env alone. Consumers call
 * getWorkspace() lazily (10s cache); saveWorkspace() invalidates.
 */
import { z } from "zod";
import { store } from "./store.js";
import { currentWorkspaceId } from "./context.js";

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

const cache = new Map<string, { ws: Workspace; at: number }>();

/**
 * A signed-in account sees ONLY what it connected itself. The .env credentials are
 * the headless workspace used by the CLI scripts and the daily cron trigger — if
 * they leaked into user workspaces, every new account would appear pre-connected
 * to the demo repo (which is exactly the bug this scoping fixes).
 */
export async function getWorkspace(): Promise<Workspace> {
  const id = currentWorkspaceId();
  const key = id ?? "__headless__";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.ws;

  const parsed = WorkspaceConfigSchema.safeParse(await store.getConfig());
  const saved: WorkspaceConfig = parsed.success ? parsed.data : {};
  const e = id === null ? process.env : ({} as NodeJS.ProcessEnv); // env only when headless

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
  cache.set(key, { ws, at: Date.now() });
  return ws;
}

export async function saveWorkspace(patch: WorkspaceConfig): Promise<void> {
  const parsed = WorkspaceConfigSchema.safeParse(await store.getConfig());
  await store.setConfig({ ...(parsed.success ? parsed.data : {}), ...patch });
  cache.delete(currentWorkspaceId() ?? "__headless__");
}
