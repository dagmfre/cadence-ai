/**
 * Cadence demo-data seeder.
 *
 * Fills TARGET_REPO with every delivery-risk signal the Cadence agent detects.
 * GitHub can't backdate created_at, so risk is driven off CONTROLLABLE signals
 * (blocked label, draft PR, a REAL failing Actions check, pending requested
 * reviewers) + a low relative staleness threshold — never real age.
 *
 *   pnpm seed           seed everything
 *   pnpm seed --reset    close/remove everything the seeder created
 */
import { config } from "dotenv";
import { Octokit } from "@octokit/rest";

config();

// ---- config -----------------------------------------------------------------
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN_CLASSIC ?? "";
const SOURCE_REPO = process.env.SOURCE_REPO ?? "";
const TARGET_REPO = process.env.TARGET_REPO ?? "";
const OVERLOAD_REVIEWER = process.env.OVERLOAD_REVIEWER?.trim() ?? "";
const LOAD_MODE = (process.env.LOAD_MODE?.trim() || (OVERLOAD_REVIEWER ? "reviewers" : "assignees")) as
  | "reviewers"
  | "assignees";
const STALE_THRESHOLD_MINUTES = Number(process.env.STALE_THRESHOLD_MINUTES ?? 30);
const RESET = process.argv.includes("--reset");
const BOARD = process.argv.includes("--board");
const CLASSIC_TOKEN = process.env.GITHUB_TOKEN_CLASSIC ?? "";
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER ?? 2);

const SEED_LABEL = "seeded";
const BRANCH_PREFIX = "cadence-seed/";
const SPRINT_NAME = "Sprint 1 — Cadence Demo";

if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN missing in .env");
if (!TARGET_REPO.includes("/")) throw new Error('TARGET_REPO must be "owner/name"');
if (!RESET && !SOURCE_REPO.includes("/")) throw new Error('SOURCE_REPO must be "owner/name"');

const [owner, repo] = TARGET_REPO.split("/") as [string, string];
const [srcOwner, srcRepo] = (SOURCE_REPO.split("/") as [string, string]) ?? ["", ""];

const gh = new Octokit({ auth: GITHUB_TOKEN });
const ghPublic = new Octokit(); // unauthenticated — for reading the public SOURCE_REPO

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = 700; // ms between writes — cushions GitHub secondary rate limits

// ---- helpers ----------------------------------------------------------------
const LABELS = [
  { name: "blocked", color: "b60205", description: "Work is blocked" },
  { name: "at-risk", color: "d93f0b", description: "Cadence flagged this as at risk" },
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { name: SEED_LABEL, color: "5319e7", description: "Created by the Cadence seeder" },
];

async function ensureLabels() {
  for (const l of LABELS) {
    try {
      await gh.issues.createLabel({ owner, repo, ...l });
    } catch (e: any) {
      if (e.status !== 422) throw e; // 422 = already exists
    }
    await sleep(250);
  }
}

async function importSourceIssues(): Promise<{ title: string; body: string; labels: string[] }[]> {
  // Authenticated read (5000/hr, reads public repos fine); fall back to anon only if scope blocks it.
  const list = (client: Octokit) => client.issues.listForRepo({ owner: srcOwner, repo: srcRepo, state: "open", per_page: 30 });
  let res;
  try {
    res = await list(gh);
  } catch {
    res = await list(ghPublic);
  }
  const known = new Set(["bug", "enhancement"]);
  return res.data
    .filter((i) => !i.pull_request)
    .slice(0, 10)
    .map((i) => ({
      title: i.title,
      body:
        (i.body ?? "_No description._").slice(0, 3500) +
        `\n\n---\n_Imported from ${SOURCE_REPO} #${i.number} for the Cadence demo._`,
      labels: i.labels
        .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
        .filter((n) => known.has(n.toLowerCase())),
    }));
}

async function createMilestone(): Promise<number> {
  const due = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
  const m = await gh.issues.createMilestone({
    owner,
    repo,
    title: SPRINT_NAME,
    state: "open",
    description: "Cadence demo sprint (seeded).",
    due_on: due,
  });
  return m.data.number;
}

const CI_WORKFLOW = `name: CI
on:
  pull_request:
jobs:
  delivery-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Delivery check
        run: |
          if [ -f cadence-seed/FAIL_MARKER ]; then
            echo "Seeded failing check"; exit 1
          fi
          echo "OK"
`;

/** Push the CI workflow to the default branch so PRs trigger a real check. Needs Contents+Workflows write. */
async function ensureWorkflow(defaultBranch: string): Promise<boolean> {
  const path = ".github/workflows/ci.yml";
  let sha: string | undefined;
  try {
    const ex = await gh.repos.getContent({ owner, repo, path, ref: defaultBranch });
    if (!Array.isArray(ex.data) && "sha" in ex.data) sha = ex.data.sha;
  } catch (e: any) {
    if (e.status !== 404) throw e;
  }
  await gh.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: "ci: add Cadence delivery check (seeded)",
    content: Buffer.from(CI_WORKFLOW).toString("base64"),
    branch: defaultBranch,
    sha,
  });
  return true;
}

async function defaultBranchSha(branch: string): Promise<string> {
  const r = await gh.git.getRef({ owner, repo, ref: `heads/${branch}` });
  return r.data.object.sha;
}

async function putFile(branch: string, path: string, content: string, message: string) {
  await gh.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
  });
}

// ---- seed -------------------------------------------------------------------
async function seed() {
  // Preflight
  const t = await gh.repos.get({ owner, repo });
  const base = t.data.default_branch;
  console.log(`Target: ${t.data.full_name} · default branch "${base}" · issues ${t.data.has_issues ? "ON" : "OFF"}`);
  if (!t.data.has_issues) throw new Error("Enable Issues on the fork (Settings → General → Features → Issues), then re-run.");

  await ensureLabels();
  console.log("Labels ensured.");

  // CI workflow (non-fatal if the token lacks Workflows write)
  let workflowOk = false;
  try {
    workflowOk = await ensureWorkflow(base);
    console.log("CI workflow pushed to default branch.");
  } catch (e: any) {
    console.warn(
      `\n⚠ Could not push .github/workflows/ci.yml (${e.status ?? "?"}: ${e.message}).\n` +
        "  The failing-CI signal needs it. Give the token 'Contents: Read and write' + 'Workflows: Write', then re-run.\n",
    );
  }

  const milestone = await createMilestone();
  console.log(`Milestone #${milestone} "${SPRINT_NAME}" (due in 4 days).`);

  // Issues imported from the public source repo
  const imported = await importSourceIssues();
  const issueNums: number[] = [];
  for (const iss of imported) {
    const created = await gh.issues.create({
      owner,
      repo,
      title: iss.title,
      body: iss.body,
      milestone,
      labels: [SEED_LABEL, ...iss.labels],
    });
    issueNums.push(created.data.number);
    await sleep(PACE);
  }
  console.log(`Created ${issueNums.length} issues from ${SOURCE_REPO}.`);

  // Close 2-3 for non-zero velocity
  const closed = issueNums.slice(0, 3);
  for (const n of closed) {
    await gh.issues.update({ owner, repo, issue_number: n, state: "closed" });
    await sleep(PACE);
  }

  // Block 2 of the open ones
  const openIssues = issueNums.slice(3);
  const blocked = openIssues.slice(0, 2);
  for (const n of blocked) {
    await gh.issues.addLabels({ owner, repo, issue_number: n, labels: ["blocked"] });
    await sleep(PACE);
  }

  // PRs (intra-fork: head is a branch here, base is our default branch)
  const baseSha = await defaultBranchSha(base);
  const prPlan = [
    { slug: "draft-feature", draft: true, fail: false },
    { slug: "failing-ci", draft: false, fail: true },
    { slug: "add-logging", draft: false, fail: false },
    { slug: "refactor-utils", draft: false, fail: false },
    { slug: "update-readme", draft: false, fail: false },
  ];
  const prs: { number: number; slug: string; draft: boolean; fail: boolean }[] = [];
  for (const p of prPlan) {
    const branch = `${BRANCH_PREFIX}${p.slug}`;
    await gh.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });
    await sleep(PACE);
    await putFile(branch, `cadence-seed/${p.slug}.md`, `# ${p.slug}\n\nSeeded change for the Cadence demo.\n`, `feat: ${p.slug} (seeded)`);
    await sleep(PACE);
    if (p.fail) {
      await putFile(branch, "cadence-seed/FAIL_MARKER", "trips the delivery check\n", "ci: trip delivery check (seeded)");
      await sleep(PACE);
    }
    const pr = await gh.pulls.create({
      owner,
      repo,
      base,
      head: branch,
      title: `[seeded] ${p.slug}`,
      body: `Seeded PR for the Cadence demo.${p.fail ? " Intentionally fails CI." : ""}`,
      draft: p.draft,
    });
    await gh.issues.addLabels({ owner, repo, issue_number: pr.data.number, labels: [SEED_LABEL] });
    prs.push({ number: pr.data.number, slug: p.slug, draft: p.draft, fail: p.fail });
    await sleep(PACE);
  }
  console.log(`Created ${prs.length} PRs.`);

  // Concentrate review/assignee load on one user
  const loadTargets = prs.map((p) => p.number);
  let loadUser = "";
  if (LOAD_MODE === "reviewers" && OVERLOAD_REVIEWER) {
    loadUser = OVERLOAD_REVIEWER;
    for (const n of loadTargets) {
      try {
        await gh.pulls.requestReviewers({ owner, repo, pull_number: n, reviewers: [OVERLOAD_REVIEWER] });
      } catch (e: any) {
        console.warn(`  reviewer request failed on #${n}: ${e.message} (is ${OVERLOAD_REVIEWER} a collaborator?)`);
      }
      await sleep(PACE);
    }
  } else {
    loadUser = owner;
    for (const n of loadTargets) {
      await gh.issues.addAssignees({ owner, repo, issue_number: n, assignees: [owner] });
      await sleep(PACE);
    }
  }

  // Summary
  console.log("\n──────── SEED SUMMARY ────────");
  console.log(`Milestone:        "${SPRINT_NAME}" due ${new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)}`);
  console.log(`Issues created:   ${issueNums.length}  (closed for velocity: ${closed.length}, blocked: ${blocked.map((n) => "#" + n).join(", ")})`);
  console.table(prs.map((p) => ({ PR: "#" + p.number, slug: p.slug, draft: p.draft, "fails CI": p.fail })));
  const failingPr = prs.find((p) => p.fail);
  console.log(`Failing check on: ${failingPr ? "#" + failingPr.number : "(none — workflow push failed)"}`);
  console.log(`Load (${LOAD_MODE}): ${loadUser} carries ${loadTargets.length} open PRs`);
  console.log(`Staleness threshold for the agent: ${STALE_THRESHOLD_MINUTES} min`);
  if (!workflowOk) console.log("⚠ CI workflow NOT pushed — the failing-check signal is missing until you fix token perms + re-run.");
  console.log("\nVerify every signal in the repo, then freeze the sprint-model shape against it.");
  console.log("Actions tab must show a run on the failing-ci PR; if empty, enable Actions on the fork.");
}

// ---- reset ------------------------------------------------------------------
async function reset() {
  console.log(`Resetting seeded state in ${TARGET_REPO} …`);

  const seeded = await gh.paginate(gh.issues.listForRepo, { owner, repo, state: "all", labels: SEED_LABEL, per_page: 100 });
  let closedCount = 0;
  for (const it of seeded) {
    if (it.state === "open") {
      await gh.issues.update({ owner, repo, issue_number: it.number, state: "closed" });
      closedCount++;
      await sleep(400);
    }
  }
  console.log(`Closed ${closedCount} seeded issues/PRs.`);

  const refs = await gh.paginate(gh.git.listMatchingRefs, { owner, repo, ref: `heads/${BRANCH_PREFIX}`, per_page: 100 });
  for (const r of refs) {
    await gh.git.deleteRef({ owner, repo, ref: r.ref.replace("refs/", "") });
    await sleep(400);
  }
  console.log(`Deleted ${refs.length} seeded branches.`);

  const ms = await gh.issues.listMilestones({ owner, repo, state: "all" });
  for (const m of ms.data.filter((m) => m.title === SPRINT_NAME)) {
    await gh.issues.deleteMilestone({ owner, repo, milestone_number: m.number });
    await sleep(400);
  }
  console.log("Deleted seeded milestone(s). (Labels + ci.yml left in place — harmless, reused next seed.)");
}

// ---- board (--board): spread Projects v2 Statuses so the signal varies ------
async function seedBoard() {
  if (!CLASSIC_TOKEN) throw new Error("GITHUB_TOKEN_CLASSIC missing (classic PAT with project+repo)");
  const ghc = new Octokit({ auth: CLASSIC_TOKEN });
  const q: any = await ghc.graphql(
    `query($login:String!,$num:Int!){ user(login:$login){ projectV2(number:$num){ id
      fields(first:20){ nodes{ ... on ProjectV2SingleSelectField{ id name options{ id name } } } }
      items(first:50){ nodes{ id content{ ... on Issue{ number } ... on PullRequest{ number } } } } } } }`,
    { login: owner, num: PROJECT_NUMBER },
  );
  const proj = q.user.projectV2;
  const statusField = proj.fields.nodes.find((f: any) => f?.name === "Status");
  const optId = (name: string) => statusField.options.find((o: any) => o.name === name)?.id;
  // Distribution: keeps Backlog items, creates In-progress/In-review stagnation + one Done/open mismatch.
  const plan: Record<number, string> = { 5: "Ready", 6: "In progress", 7: "In progress", 8: "In review", 9: "Done" };
  for (const item of proj.items.nodes) {
    const target = plan[item.content?.number];
    if (!target) continue;
    await ghc.graphql(
      `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(
        input:{ projectId:$p, itemId:$i, fieldId:$f, value:{ singleSelectOptionId:$o } }){ projectV2Item{ id } } }`,
      { p: proj.id, i: item.id, f: statusField.id, o: optId(target) },
    );
    console.log(`  #${item.content.number} → ${target}`);
    await sleep(400);
  }
  console.log("Board statuses spread.");
}

// ---- main -------------------------------------------------------------------
(async () => {
  try {
    if (RESET) await reset();
    else if (BOARD) await seedBoard();
    else await seed();
  } catch (e: any) {
    console.error(`\n✖ ${e.status ?? ""} ${e.message}`);
    if (e.status === 403)
      console.error(
        "  403 usually means the token is missing a permission. The seeder needs:\n" +
          "  Metadata R, Contents R+W, Issues R+W, Pull requests R+W, Workflows W, Checks R — scoped to TARGET_REPO.",
      );
    process.exit(1);
  }
})();
