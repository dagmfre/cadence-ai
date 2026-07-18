/**
 * GitHub ingest + write client (DECISIONS §7, §10).
 * Reads: 3 REST calls + check-runs + 1 Projects-v2 GraphQL query → SprintModel.
 * Writes: addLabel / comment (the closed-loop actions).
 */
import { Octokit } from "@octokit/rest";
import { BoardStatus, DeliveryItem, SprintModel, SprintModelSchema } from "./model.js";
import { getWorkspace } from "./workspace.js";

/**
 * Setup isn't finished yet (no token, no repo, or no sprint to track). Always a
 * 409 with a next step the user can actually act on — never a 500.
 */
export class NotConnectedError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "NotConnectedError";
  }
}

const clients = new Map<string, Octokit>(); // per-token, so two accounts don't thrash one slot

/** Lazy workspace-driven client — wizard-connected config wins over env (C1). */
async function ctx() {
  const ws = await getWorkspace();
  if (!ws.githubToken) throw new NotConnectedError("Connect GitHub in the wizard first.");
  const [owner, repo] = ws.repo.split("/") as [string, string];
  if (!owner || !repo) throw new NotConnectedError("Pick a repository in the wizard first.");
  let gh = clients.get(ws.githubToken);
  if (!gh) {
    gh = new Octokit({ auth: ws.githubToken });
    clients.set(ws.githubToken, gh);
  }
  return { gh, owner, repo, projectNumber: ws.projectNumber };
}

let warnedBoard = false;

/**
 * Board status is ENRICHMENT, not a requirement: plenty of repos have no Projects v2
 * board, and the board may be owned by a user or an org. Any failure here degrades to
 * "no board data" instead of taking down the whole sprint fetch.
 */
async function boardStatuses(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const { gh, owner, projectNumber } = await ctx();
  if (projectNumber == null) return map; // no board connected — nothing to read

  const fields = `projectV2(number:$num){ items(first:100){ nodes{
        content{ ... on Issue{ number } ... on PullRequest{ number } }
        fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{ name } } } } }`;

  let q: any;
  try {
    q = await gh.graphql(`query($login:String!,$num:Int!){ user(login:$login){ ${fields} } organization(login:$login){ ${fields} } }`, {
      login: owner,
      num: projectNumber,
    });
  } catch (e) {
    // A partial response still carries the half that resolved (owner is a user OR an org).
    q = (e as { data?: unknown }).data;
    if (!q) {
      if (!warnedBoard) console.warn(`⚠ Couldn't read Projects v2 board #${projectNumber} for ${owner} — continuing without board status.`);
      warnedBoard = true;
      return map;
    }
  }

  const nodes = q.user?.projectV2?.items?.nodes ?? q.organization?.projectV2?.items?.nodes ?? [];
  for (const n of nodes)
    if (n?.content?.number && n.fieldValueByName?.name) map.set(n.content.number, n.fieldValueByName.name);
  return map;
}

/** If CI_CHECK_NAME is set, that check's conclusion wins (teams pick which check gates delivery); else aggregate. */
async function ciStatus(headSha: string): Promise<DeliveryItem["ciStatus"]> {
  const { gh, owner, repo } = await ctx();
  const r = await gh.checks.listForRef({ owner, repo, ref: headSha, per_page: 100 });
  let runs = r.data.check_runs;
  if (!runs.length) return "none";
  const primary = process.env.CI_CHECK_NAME && runs.filter((c) => c.name === process.env.CI_CHECK_NAME);
  if (primary && primary.length) runs = primary;
  if (runs.some((c) => c.conclusion === "failure")) return "failing";
  if (runs.some((c) => c.status !== "completed")) return "pending";
  return "passing";
}

export async function fetchSprintModel(): Promise<SprintModel> {
  const { gh, owner, repo } = await ctx();
  // Sprint = nearest-due open milestone (DECISIONS §17)
  const ms = await gh.issues.listMilestones({ owner, repo, state: "open", sort: "due_on", direction: "asc" });
  const m = ms.data[0];
  if (!m)
    throw new NotConnectedError(
      `${owner}/${repo} has no open milestone. Cadence tracks a sprint as a GitHub milestone — create one with a due date, add the sprint's issues to it, then scan again.`,
    );

  const [issuesRes, prsRes, board] = await Promise.all([
    gh.paginate(gh.issues.listForRepo, { owner, repo, milestone: String(m.number), state: "all", per_page: 100 }),
    gh.paginate(gh.pulls.list, { owner, repo, state: "open", per_page: 100 }),
    boardStatuses(),
  ]);

  const parseBoard = (n: number) => {
    const s = board.get(n);
    return s && BoardStatus.safeParse(s).success ? (s as DeliveryItem["boardStatus"]) : null;
  };

  const issues: DeliveryItem[] = issuesRes
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      type: "issue",
      title: i.title,
      url: i.html_url,
      author: i.user?.login ?? "unknown",
      assignees: (i.assignees ?? []).map((a) => a.login),
      requestedReviewers: [],
      labels: i.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
      state: i.state as "open" | "closed",
      draft: false,
      ciStatus: "none",
      boardStatus: parseBoard(i.number),
      updatedAt: i.updated_at,
      linkedIssueNumbers: [],
    }));

  const prs: DeliveryItem[] = await Promise.all(
    prsRes.map(async (p) => ({
      number: p.number,
      type: "pr" as const,
      title: p.title,
      url: p.html_url,
      author: p.user?.login ?? "unknown",
      assignees: (p.assignees ?? []).map((a) => a.login),
      requestedReviewers: (p.requested_reviewers ?? []).map((r) => r.login),
      labels: p.labels.map((l) => l.name).filter(Boolean),
      state: "open" as const,
      draft: !!p.draft,
      ciStatus: await ciStatus(p.head.sha),
      boardStatus: parseBoard(p.number),
      updatedAt: p.updated_at,
      linkedIssueNumbers: [...p.body?.matchAll(/#(\d+)/g) ?? []].map((x) => Number(x[1])),
    })),
  );

  const reviewerLoad: Record<string, number> = {};
  const assigneeLoad: Record<string, number> = {};
  for (const p of prs) {
    for (const r of p.requestedReviewers) reviewerLoad[r] = (reviewerLoad[r] ?? 0) + 1;
    for (const a of p.assignees) assigneeLoad[a] = (assigneeLoad[a] ?? 0) + 1;
  }
  for (const i of issues) if (i.state === "open") for (const a of i.assignees) assigneeLoad[a] = (assigneeLoad[a] ?? 0) + 1;

  const weekAgo = Date.now() - 7 * 86400000;
  const closedLast7Days = issuesRes.filter((i) => i.closed_at && new Date(i.closed_at).getTime() > weekAgo).length;

  return SprintModelSchema.parse({
    repo: `${owner}/${repo}`,
    sprint: { number: m.number, title: m.title, dueOn: m.due_on, openCount: m.open_issues, closedCount: m.closed_issues },
    items: [...issues, ...prs],
    reviewerLoad,
    assigneeLoad,
    closedLast7Days,
    fetchedAt: new Date().toISOString(),
  });
}

/** D19 enrichment tool: compact recent timeline of an issue/PR for root-cause reasoning. */
export async function getItemTimeline(itemNumber: number): Promise<string[]> {
  const { gh, owner, repo } = await ctx();
  const ev = await gh.issues.listEventsForTimeline({ owner, repo, issue_number: itemNumber, per_page: 40 });
  return ev.data.slice(-15).map((e: any) => {
    const who = e.actor?.login ?? e.user?.login ?? "";
    const when = (e.created_at ?? e.submitted_at ?? "").slice(0, 16);
    const extra = e.label?.name ?? e.requested_reviewer?.login ?? (e.body ? `"${String(e.body).slice(0, 80)}"` : "");
    return `${when} ${e.event} ${who} ${extra}`.trim();
  });
}

// ---- closed-loop writes ------------------------------------------------------
export async function addLabel(itemNumber: number, label: string) {
  const { gh, owner, repo } = await ctx();
  await gh.issues.addLabels({ owner, repo, issue_number: itemNumber, labels: [label] });
}
/** Marker lets `pnpm reset:actions` find and delete exactly Cadence's comments. */
const CADENCE_MARKER = "<!-- cadence-bot -->";
export async function comment(itemNumber: number, body: string) {
  const { gh, owner, repo } = await ctx();
  await gh.issues.createComment({ owner, repo, issue_number: itemNumber, body: `${body}\n\n${CADENCE_MARKER}\n— _Cadence · delivery bot_` });
}

/** Undo everything a real run wrote: remove at-risk labels + delete Cadence's comments. Keeps the repo demo-fresh. */
export async function undoActions(): Promise<string[]> {
  const { gh, owner, repo } = await ctx();
  const log: string[] = [];
  const issues = await gh.paginate(gh.issues.listForRepo, { owner, repo, state: "all", per_page: 100 });
  for (const it of issues)
    if (it.labels.some((l) => (typeof l === "string" ? l : l.name) === "at-risk")) {
      await gh.issues.removeLabel({ owner, repo, issue_number: it.number, name: "at-risk" }).catch(() => {});
      log.push(`removed at-risk #${it.number}`);
    }
  const comments = await gh.paginate(gh.issues.listCommentsForRepo, { owner, repo, per_page: 100 });
  for (const c of comments)
    if (c.body?.includes(CADENCE_MARKER)) {
      await gh.issues.deleteComment({ owner, repo, comment_id: c.id });
      log.push(`deleted comment ${c.id}`);
    }
  return log;
}
