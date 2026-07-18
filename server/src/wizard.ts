/**
 * Connect Wizard APIs (PRODUCT_FLOWS §2, D16): GitHub OAuth (primary) + PAT
 * fallback, discovery (repos/boards/channels), roster auto-match (§4), and
 * completion. Every step live-validates before it saves to the workspace.
 */
import type { FastifyInstance } from "fastify";
import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getWorkspace, saveWorkspace, AutonomySchema, WorkspaceConfigSchema } from "./workspace.js";
import { fetchSprintModel, NotConnectedError } from "./github.js";

/** OAuth CSRF nonces → expiry. In-memory: the app assumes a single instance. */
const states = new Map<string, number>();
const STATE_TTL_MS = 10 * 60_000;

function takeState(state: string): boolean {
  const now = Date.now();
  for (const [s, exp] of states) if (exp < now) states.delete(s); // prune abandoned flows
  const expiry = states.get(state);
  states.delete(state);
  return expiry !== undefined && expiry >= now;
}

/** Authenticated Octokit for wizard discovery, or a 409 telling the user what to do. */
async function wizardGh(): Promise<Octokit> {
  const ws = await getWorkspace();
  if (!ws.githubToken) throw new NotConnectedError("Connect GitHub first.");
  return new Octokit({ auth: ws.githubToken });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function validateGithub(token: string) {
  const login = (await new Octokit({ auth: token }).users.getAuthenticated()).data.login;
  await saveWorkspace({ githubToken: token, githubLogin: login });
  return login;
}

export function registerWizard(app: FastifyInstance): void {
  // ---- Step 1 · GitHub: OAuth primary ----
  app.get("/auth/github", async (_req, reply) => {
    const id = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!id) return reply.code(500).send({ error: "GITHUB_OAUTH_CLIENT_ID not configured — use the PAT fallback" });
    const state = randomBytes(16).toString("hex");
    states.set(state, Date.now() + STATE_TTL_MS);
    const url = `https://github.com/login/oauth/authorize?client_id=${id}&scope=${encodeURIComponent("repo project read:user user:email")}&state=${state}`;
    return reply.redirect(url);
  });

  app.get("/auth/github/callback", async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || !takeState(state))
      return reply.code(400).send({ error: "That sign-in link expired — start the GitHub step again." });
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code }),
    });
    const data = (await res.json()) as { access_token?: string; error_description?: string };
    if (!data.access_token) return reply.code(400).send({ error: data.error_description ?? "token exchange failed" });
    const login = await validateGithub(data.access_token);
    return reply.redirect(`/?wizard=github&login=${login}`);
  });

  // PAT fallback — same validation, same storage
  app.post("/api/wizard/github", async (req, reply) => {
    const token = String((req.body as { token?: string })?.token ?? "").trim();
    if (!token) return reply.code(400).send({ error: "token required" });
    try {
      return { login: await validateGithub(token) };
    } catch {
      return reply.code(400).send({ error: "GitHub rejected that token — check its scopes (repo + project)" });
    }
  });

  // ---- Discovery: the dev PICKS rather than types ----
  app.get("/api/wizard/repos", async () => {
    const gh = await wizardGh();
    const repos = await gh.repos.listForAuthenticatedUser({ sort: "updated", per_page: 30 });
    return repos.data.map((r) => ({ fullName: r.full_name, private: r.private, openIssues: r.open_issues_count }));
  });

  app.get("/api/wizard/boards", async () => {
    const gh = await wizardGh();
    const q: any = await gh.graphql(`query{ viewer{ projectsV2(first:20){ nodes{ number title } } } }`);
    return (q.viewer.projectsV2.nodes ?? []).map((n: { number: number; title: string }) => n);
  });

  app.post("/api/wizard/repo", async (req, reply) => {
    const parsed = z
      .object({
        repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Repository must look like "owner/name"'),
        // null is meaningful: "no Projects v2 board".
        projectNumber: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid repository" });
    const { repo, projectNumber } = parsed.data;
    await saveWorkspace({ repo, ...(projectNumber !== undefined && { projectNumber }) });
    return { saved: true };
  });

  // ---- Step 2 · Slack: validate tokens, list channels, pick ----
  app.post("/api/wizard/slack", async (req, reply) => {
    const { botToken, channelId } = req.body as { botToken?: string; channelId?: string };
    const token = botToken?.trim() || (await getWorkspace()).slackBotToken;
    if (!token) return reply.code(400).send({ error: "bot token required" });
    const web = new WebClient(token);
    try {
      const auth = await web.auth.test();
      if (channelId) {
        await saveWorkspace({ slackBotToken: token, slackChannelId: channelId });
        return { team: auth.team, channelId, saved: true };
      }
      await saveWorkspace({ slackBotToken: token });
      const chans = await web.conversations.list({ types: "public_channel,private_channel", limit: 100, exclude_archived: true });
      return { team: auth.team, channels: (chans.channels ?? []).map((c) => ({ id: c.id, name: c.name, isMember: c.is_member })) };
    } catch {
      return reply.code(400).send({ error: "Slack rejected that token" });
    }
  });

  // ---- Step 3 · Team roster: GitHub logins × Slack members, auto-matched (§4) ----
  app.get("/api/wizard/roster", async () => {
    const ws = await getWorkspace();
    // No sprint yet is a normal state for a fresh repo — return what we can (the
    // Slack side) with a note, rather than dead-ending the wizard on an error.
    let logins: string[] = [];
    let note: string | null = null;
    try {
      const model = await fetchSprintModel();
      logins = [...new Set(model.items.flatMap((i) => [i.author, ...i.assignees, ...i.requestedReviewers]))].filter(
        (l) => l !== "unknown",
      );
    } catch (e) {
      note = (e as Error).message;
    }
    const web = ws.slackBotToken && ws.slackChannelId ? new WebClient(ws.slackBotToken) : null;
    let members: { id: string; name: string; realName: string }[] = [];
    if (web) {
      const ids = (await web.conversations.members({ channel: ws.slackChannelId! })).members ?? [];
      members = (
        await Promise.all(
          ids.map(async (id) => {
            const u = (await web.users.info({ user: id })).user;
            return u && !u.is_bot ? { id, name: u.name ?? "", realName: u.real_name ?? "" } : null;
          }),
        )
      ).filter((m): m is NonNullable<typeof m> => !!m);
    }
    const roster = logins.map((login) => {
      const exact = members.find((m) => norm(m.name) === norm(login) || norm(m.realName) === norm(login));
      const partial = exact ?? members.find((m) => norm(m.realName).includes(norm(login)) || norm(login).includes(norm(m.name)));
      const match = exact ?? partial;
      return {
        githubLogin: login,
        slackId: ws.teamMap[login] ?? match?.id ?? null,
        slackName: match ? match.realName || match.name : null,
        confidence: ws.teamMap[login] ? "saved" : exact ? "high" : partial ? "medium" : "unmatched",
      };
    });
    return { roster, slackMembers: members, note };
  });

  // ---- Step 4 · Autonomy + finish (first scan is the caller's next request) ----
  app.post("/api/wizard/complete", async (req, reply) => {
    const body = WorkspaceConfigSchema.pick({ teamMap: true, autonomy: true }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid body" });
    await saveWorkspace(body.data);
    return { connected: true };
  });

  // ---- Workspace state for the UI (tokens masked) + settings ----
  app.get("/api/workspace", async () => {
    const ws = await getWorkspace();
    return {
      githubConnected: !!ws.githubToken,
      githubLogin: ws.githubLogin ?? null,
      repo: ws.repo || null,
      projectNumber: ws.projectNumber,
      slackConnected: !!ws.slackBotToken,
      slackChannelId: ws.slackChannelId ?? null,
      teamMap: ws.teamMap,
      autonomy: ws.autonomy,
    };
  });

  app.post("/api/settings", async (req, reply) => {
    const body = WorkspaceConfigSchema.pick({ teamMap: true, autonomy: true }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: `invalid: expected teamMap/autonomy (${AutonomySchema.options.join("|")})` });
    await saveWorkspace(body.data);
    return { saved: true };
  });
}
