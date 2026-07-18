/**
 * `pnpm seed:team` — spreads the sprint across the repo's real collaborators.
 *
 * The base seeder (`pnpm seed`) puts every PR on one person, which makes for a
 * one-note demo: Cadence finds one problem and messages one human. This adds work
 * owned by the *other* collaborators so a run produces several distinct risks with
 * several distinct owners — which is the point of an EDM that closes the loop.
 *
 * Purely additive. It creates new PRs and assigns existing issues; it never closes
 * or deletes anything, so it is safe to run on top of an already-seeded repo and
 * safe to re-run (existing branches are reused).
 *
 * Staleness note: the "stalled PR" and "parked draft" signals need an item to be
 * untouched for STALE_THRESHOLD_MINUTES (default 30). Freshly created PRs are not
 * stale yet — run this at least that long before recording.
 */
import { config } from "dotenv";
import { Octokit } from "@octokit/rest";

config();

const TOKEN = process.env.GITHUB_TOKEN_CLASSIC ?? process.env.GITHUB_TOKEN ?? "";
const TARGET_REPO = process.env.TARGET_REPO ?? "";
if (!TOKEN) throw new Error("GITHUB_TOKEN_CLASSIC missing in .env");
if (!TARGET_REPO.includes("/")) throw new Error('TARGET_REPO must be "owner/name"');

const [owner, repo] = TARGET_REPO.split("/") as [string, string];
const gh = new Octokit({ auth: TOKEN });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = 700; // cushions GitHub's secondary rate limits
const SEED_LABEL = "seeded";
const BRANCH_PREFIX = "cadence-seed/";

/** Best-effort: a step that fails must not abort the rest of the seed. */
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    console.log(`  ✓ ${label}`);
    return r;
  } catch (e) {
    console.warn(`  ⚠ ${label} — ${(e as Error).message}`);
    return null;
  }
}

async function branchSha(branch: string): Promise<string> {
  const r = await gh.git.getRef({ owner, repo, ref: `heads/${branch}` });
  return r.data.object.sha;
}

async function putFile(branch: string, path: string, content: string, message: string) {
  let sha: string | undefined;
  try {
    const ex = await gh.repos.getContent({ owner, repo, path, ref: branch });
    if (!Array.isArray(ex.data) && "sha" in ex.data) sha = ex.data.sha;
  } catch {
    /* new file */
  }
  await gh.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    sha,
  });
}

/** Create the PR if its branch doesn't already have one — re-runs shouldn't duplicate. */
async function ensurePr(spec: {
  slug: string;
  title: string;
  body: string;
  draft: boolean;
  failCi: boolean;
  assignee: string;
  base: string;
}): Promise<number | null> {
  const branch = `${BRANCH_PREFIX}${spec.slug}`;

  const existing = await gh.pulls.list({ owner, repo, state: "open", head: `${owner}:${branch}` });
  if (existing.data[0]) {
    console.log(`  = PR #${existing.data[0].number} already exists for ${spec.slug}`);
    return existing.data[0].number;
  }

  try {
    await gh.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: await branchSha(spec.base) });
  } catch (e) {
    if ((e as { status?: number }).status !== 422) throw e; // 422 = branch already there
  }
  await sleep(PACE);

  await putFile(branch, `cadence-seed/${spec.slug}.md`, `# ${spec.slug}\n\nSeeded change for the Cadence demo.\n`, `feat: ${spec.slug} (seeded)`);
  await sleep(PACE);
  if (spec.failCi) {
    await putFile(branch, "cadence-seed/FAIL_MARKER", "trips the delivery check\n", "ci: trip delivery check (seeded)");
    await sleep(PACE);
  }

  const pr = await gh.pulls.create({ owner, repo, base: spec.base, head: branch, title: spec.title, body: spec.body, draft: spec.draft });
  await sleep(PACE);
  await gh.issues.addLabels({ owner, repo, issue_number: pr.data.number, labels: [SEED_LABEL] });
  await sleep(PACE);
  await gh.issues.addAssignees({ owner, repo, issue_number: pr.data.number, assignees: [spec.assignee] });
  await sleep(PACE);
  return pr.data.number;
}

async function main() {
  const info = await gh.repos.get({ owner, repo });
  const base = info.data.default_branch;

  // Who is actually on this repo — never guess logins.
  const collabs = await gh.repos.listCollaborators({ owner, repo, per_page: 100 });
  const others = collabs.data.map((c) => c.login).filter((l) => l.toLowerCase() !== owner.toLowerCase());
  if (others.length < 2)
    throw new Error(`Need at least 2 collaborators besides ${owner}; found [${others.join(", ") || "none"}]. Invite them and accept first.`);

  const [devA, devB] = others as [string, string];
  console.log(`Repo ${TARGET_REPO} · base "${base}"`);
  console.log(`Collaborators: ${owner} (you) + ${devA} + ${devB}\n`);

  // The open sprint milestone — new PRs must join it or the sprint model won't see them.
  const milestones = await gh.issues.listMilestones({ owner, repo, state: "open", sort: "due_on", per_page: 10 });
  const milestone = milestones.data[0]?.number;
  console.log(milestone ? `Sprint milestone: #${milestone} "${milestones.data[0]?.title}"\n` : "⚠ no open milestone — run `pnpm seed` first\n");

  // ── New PRs, each carrying a different risk, each owned by a different person ──
  console.log("New pull requests:");
  const created: { pr: number | null; who: string; signal: string }[] = [];

  created.push({
    pr: await step(`#? broken-migration → ${devB} (will fail CI)`, () =>
      ensurePr({
        slug: "broken-migration",
        title: "[seeded] fix: session table migration",
        body: "Seeded PR for the Cadence demo. Intentionally fails the delivery check.",
        draft: false,
        failCi: true,
        assignee: devB,
        base,
      }),
    ),
    who: devB,
    signal: "failing CI",
  });

  created.push({
    pr: await step(`#? api-retry → ${devA} (will go stale)`, () =>
      ensurePr({
        slug: "api-retry",
        title: "[seeded] feat: retry transient API failures",
        body: "Seeded PR for the Cadence demo. Left untouched so it reads as stalled.",
        draft: false,
        failCi: false,
        assignee: devA,
        base,
      }),
    ),
    who: devA,
    signal: "stalled PR",
  });

  created.push({
    pr: await step(`#? wip-dashboard → ${devA} (parked draft)`, () =>
      ensurePr({
        slug: "wip-dashboard",
        title: "[seeded] wip: usage dashboard",
        body: "Seeded draft PR for the Cadence demo. Parked with no recent activity.",
        draft: true,
        failCi: false,
        assignee: devA,
        base,
      }),
    ),
    who: devA,
    signal: "parked draft",
  });

  // Put the new PRs in the sprint, or they're invisible to the scan.
  if (milestone)
    for (const c of created)
      if (c.pr) {
        await step(`#${c.pr} added to the sprint milestone`, () =>
          gh.issues.update({ owner, repo, issue_number: c.pr!, milestone }),
        );
        await sleep(PACE);
      }

  // ── Give the blocked issues an owner, so a blocker has someone to nudge ──
  console.log("\nBlocked issues:");
  const blocked = await gh.paginate(gh.issues.listForRepo, { owner, repo, state: "open", labels: "blocked", per_page: 100 });
  // One keeps no assignee on purpose: "at-risk item with nobody on it" is its own finding.
  for (const [i, iss] of blocked.entries()) {
    if (i === 0) {
      console.log(`  = #${iss.number} left unassigned on purpose (keeps the "no owner" signal)`);
      continue;
    }
    const who = i === 1 ? devB : devA;
    if (iss.assignees?.length) {
      console.log(`  = #${iss.number} already assigned to ${iss.assignees.map((a) => a.login).join(", ")}`);
      continue;
    }
    await step(`#${iss.number} blocked issue → ${who}`, () => gh.issues.addAssignees({ owner, repo, issue_number: iss.number, assignees: [who] }));
    await sleep(PACE);
  }

  // ── Pile reviews on one person: the review-bottleneck signal ──
  console.log(`\nReview requests (builds the bottleneck on ${devA}):`);
  const openPrs = await gh.pulls.list({ owner, repo, state: "open", per_page: 100 });
  const reviewable = openPrs.data.filter((p) => !p.draft && p.user?.login !== devA).slice(0, 4);
  for (const p of reviewable) {
    await step(`#${p.number} review requested from ${devA}`, () =>
      gh.pulls.requestReviewers({ owner, repo, pull_number: p.number, reviewers: [devA] }),
    );
    await sleep(PACE);
  }

  // ── Spread a couple of plain issues so ownership isn't all one person ──
  console.log("\nUnowned sprint issues:");
  const openIssues = (
    await gh.paginate(gh.issues.listForRepo, { owner, repo, state: "open", labels: SEED_LABEL, per_page: 100 })
  ).filter((i) => !i.pull_request && !i.assignees?.length && !i.labels.some((l) => (typeof l === "string" ? l : l.name) === "blocked"));
  for (const [i, iss] of openIssues.slice(0, 2).entries()) {
    const who = i === 0 ? devA : devB;
    await step(`#${iss.number} → ${who}`, () => gh.issues.addAssignees({ owner, repo, issue_number: iss.number, assignees: [who] }));
    await sleep(PACE);
  }

  console.log("\n──────── WHO OWNS WHAT ────────");
  console.table([
    { person: owner, role: "you (delivery lead)", carries: "the original 5 PRs" },
    { person: devA, role: "reviewer bottleneck", carries: "4 pending reviews + a stalled PR + a parked draft" },
    { person: devB, role: "blocked + failing", carries: "a failing-CI PR + a blocked issue" },
  ]);
  console.log(
    `\nTEAM_MAP must use these GitHub logins — otherwise DMs fall back to channel mentions:\n` +
      `  ${[owner, devA, devB].map((l) => `"${l}": "<their Slack U-id>"`).join(", ")}\n`,
  );
  const stale = Number(process.env.STALE_THRESHOLD_MINUTES ?? 30);
  console.log(`⏳ The stalled/parked signals need ${stale} minutes of quiet. Seed now, record after that.`);
}

await main();
