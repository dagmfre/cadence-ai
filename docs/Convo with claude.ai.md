# Recruiter document guidance and instructions - Claude

Recruiter document guidance and instructions

Claude finished the response

Use the up and down arrow keys to move between messages.

Load earlier messages

## Claude responded: DECISIONS.

Architected comprehensive decisions file and sequenced implementation roadmap

Architected comprehensive decisions file and sequenced implementation roadmap

DECISIONS.md is ready — full contract with the locked table up top, the 4 worries resolved, all 9 decisions detailed, the coupled-decision warnings, a pre-code verification checklist, and the timeline risk. Drop it in the repo root and hand it to Claude Code.

### Your next steps (in order)

You have ~14 hours. This ordering front-loads the one thing that can sink you (demo data) and protects the graded property (closed-loop action).

**Hour 0 — accounts + keys (30 min, do this first)**  
Work the checklist at the bottom of DECISIONS.md: Koyeb, Upstash Redis, GitHub fine-grained token (5 perms), cron-job.org, Slack app in Socket Mode. Confirm none ask for a card. Confirm `gemini-2.5-flash` responds on your key (and check if `gemini-3.5-flash` is available — free upgrade if so).

**Hours 0–2 — the seeder (critical path)**  
Create the demo repo. Write and run the Node seeder: milestone due in a few days, ~10 issues (some `blocked`), ~5 PRs (one draft, one with a **real** failing Actions check, one with 4–6 reviewers piled on one user). Set staleness thresholds to minutes/hours. Do not move on until every risk category visibly lights up in the raw API responses.

**Hours 2–3 — freeze the sprint model**  
Define the TypeScript sprint-model shape (`DeliveryItem`, `RiskFinding`, `Forecast`, `ActionPlan`) against the seeded data. Write the Octokit ingest (milestones → issues → open PRs → check-runs) + the reviewer-load rollup. This is the contract every agent reads.

**Hours 3–5 — deterministic core**  
Plain-TypeScript risk scoring + forecast math. No LLM. Stable, explainable, testable. Get RAG status and projected slip coming out correctly on the seeded repo.

**Hours 5–9 — agent pipeline + closed-loop actions**  
LangGraph.js `StateGraph`: risk+cause → forecast → action. Pin the langgraph version, pick one state syntax, ground snippets against the LangChain MCP. Then wire the **GitHub writes first** (auto-label, comment) — that's the graded property. Then the Slack report.

**Hours 9–11 — approval queue + conversational**  
Pending actions in Upstash + approve-to-execute. Then the separate conversational agent + Slack Socket Mode thread path ("why are we slipping?" → evidence → act from reply).

**Hours 11–12.5 — frontend**  
React + Vite: risk list (with root cause + recommended action), forecast/RAG, approval panel, chat, scan button. Functional over pretty.

**Hour 12.5 — deploy + wire the trigger**  
Push to Koyeb, point cron-job.org at `/run-daily-scan`, smoke-test the whole loop end to end.

**Hours 13–14 — seed fresh, record, package**  
Re-seed for a clean demo state. Record the video hitting the four required beats (problem → design → live demo through the UI → code walkthrough). Package repo + solution doc + DECISIONS.md + video. Submit before midnight.

One rule if you fall behind: cut frontend polish and the conversational agent before you cut the closed-loop GitHub writes. The writes are what the reviewer graded you on.

Want the sprint-model TypeScript shape + seeder plan sketched out now so you can hand both straight to Claude Code?

Decisions

Document · MD 

Download





## You said: Short answer: Instead of creating a new repo and seeding it, could i just fork an opensource repo WITH multiple issues and just use that?

Short answer: Instead of creating a new repo and seeding it, could i just fork an opensource repo WITH multiple issues and just use that??

7:33 PM





## Claude responded: Short answer: no, that doesn't work — for two reasons.

Evaluated fork viability, identified write-access constraints, proposed hybrid solution

Evaluated fork viability, identified write-access constraints, proposed hybrid solution

Short answer: no, that doesn't work — for two reasons.

**Forks don't copy issues.** A GitHub fork copies code, branches, and tags only. Issues, PRs, milestones, and labels do not come with it. Your fork would start with zero issues, so there's nothing to ingest.

**Even pointing read-only at the original repo breaks the graded feature.** You could aim Cadence at a public OSS repo and read its real issues/PRs. But you can't write to a repo you don't own — no labels, no comments. That kills the closed-loop action the reviewer is grading you on. You'd be back to a read-only "basic" tool.

You also lose control of the exact signals the demo needs: a near-due milestone, a `blocked` label, a real failing CI check on a specific PR, and reviewers piled on one person. Real repos almost never have that combination cleanly.

### What actually saves you time

Keep your own repo (you need write access anyway), but **import issue text from a real OSS repo** so you don't hand-write content:

```
Script: pull ~10 issue titles/bodies from a public repo's API
        → recreate them as issues in YOUR repo
        → then overlay the risk signals (labels, PRs, failing check, reviewer pile-up)
```

The hard part of seeding was never the issue text — it's the risk signals, and no fork gives you those. Importing text buys you realism for maybe 15 minutes of work while keeping write access and full control.

Want me to fold that "import from OSS + overlay signals" approach into the seeder plan?





## You said: So what about this: Clone or fork or download an oss then also pull issue/bodies milestones from it separetely

-   So what about this: Clone or fork or download an oss then also pull issue/bodies milestones from it separetely
-   so if i can do the above, I wanna fully automate that process with claude code, so if i can automate that please provide the prompt for claude code to do all that and if there are things that i should manually do necessarily, please provide a final step-by-step specific guidance for me including choosing a repo(if you approve the above)

7:41 PM





## Claude responded: Approved, with one correction that saves you time.

Weighed fork strategy, API automation, and reviewer-load mechanics thoroughly

Weighed fork strategy, API automation, and reviewer-load mechanics thoroughly

Approved, with one correction that saves you time.

### The correction

Split it by what actually matters to the agent:

Thing

Worth importing?

Why

Issue titles/bodies + milestone

**Yes**

This is the realism win. Makes the backlog look real.

The OSS **code**

Optional

The agent reads metadata (PR state, reviews, CI), not code. Code only matters so the repo looks real if the reviewer clicks in.

Risk signals (labels, failing CI, reviewer pile-up)

**Must overlay yourself**

No OSS repo has this exact combination. Nothing gives you these for free.

So: fork for the code + write access (fast), but issues/milestones get **imported by script** (forks don't copy them), and signals get **overlaid by script**. That's your plan, made to work.

### One gotcha to decide now: the reviewer-overload example

The headline demo ("reviewer has 6 open reviews → reassign") needs a real load signal. Two paths:

-   **Realistic (recommended):** a second GitHub account (free) added as a collaborator, then the seeder requests it as reviewer on 5–6 PRs. `requested_reviewers` lights up cleanly.
-   **Solo fallback:** the seeder uses PR **assignees** as the load proxy (you can assign yourself to many). Works with one account; slightly less semantically "review," but the root-cause agent reads whatever field you populate.

Pick one before running the seeder. If you have a friend's GitHub or a spare account, take the realistic path.

### Manual steps (you must do these — auth + toggles)

**1\. Choose the source repo.** Criteria:

-   Public, active, 20+ open issues with substantive titles/bodies
-   A real software project (fits the "engineering team sprint" story)
-   Mid-size, not a giant monorepo (forking is fast, looks like one team)
-   Bonus: already uses `bug`/`enhancement` labels

Good archetypes: a popular CLI tool, a mid-size library, or a framework plugin. Pick one you can _talk about_ in the video — familiarity makes the walkthrough smoother. Verify the open-issue count on the Issues tab before committing.

**2\. Fork it.** Then in the fork's **Settings**, flip on two things that are OFF by default on forks:

-   **Issues** (Settings → General → Features → Issues)
-   **Actions** (Settings → Actions → Allow all actions)

**3\. Create the fine-grained token** scoped to your fork, with: Metadata R, Contents R, Issues R+W, Pull requests R+W, Checks R.

**4\. (If realistic reviewer path)** Add the 2nd account as a collaborator (Settings → Collaborators → invite → accept from the other account).

**5\. Hand Claude Code:** the token, `SOURCE_REPO` (owner/name of the OSS repo), `TARGET_REPO` (your fork), and the reviewer username (2nd account) or the flag to use assignees.

### The Claude Code prompt

```
Build a demo-data seeder for Cadence at scripts/seed.ts (TypeScript + Octokit, run with tsx/pnpm).

CONTEXT
- TARGET_REPO is my fork (I own it, write access). SOURCE_REPO is a public OSS repo.
- Goal: make TARGET_REPO show every delivery-risk category so the Cadence agent has real
  signals to detect. GitHub can't backdate created_at, so drive risk off controllable signals
  + low relative staleness thresholds, NOT real age.

INPUTS (env vars, read from .env)
- GITHUB_TOKEN (fine-grained, write on TARGET_REPO)
- SOURCE_REPO = "owner/name"
- TARGET_REPO = "owner/name"
- OVERLOAD_REVIEWER = a github username (2nd account) OR empty
- LOAD_MODE = "reviewers" | "assignees"  (if OVERLOAD_REVIEWER empty, use "assignees" with my own username)
- STALE_THRESHOLD_MINUTES = 30  (surface this so Cadence's risk logic can treat fresh items as stale)

WHAT TO BUILD
1) Import: read ~10 open issues (title + body + labels) and any milestones from SOURCE_REPO
   via the public API. Recreate them in TARGET_REPO as new issues.
2) Milestone: create one milestone in TARGET_REPO named like a sprint, due in 4 days, and assign
   the recreated issues to it. Close 2-3 issues so velocity is non-zero.
3) Labels: ensure "blocked", "at-risk", "bug", "enhancement" exist. Apply "blocked" to 2 issues.
4) PRs: create 5 PRs INTRA-FORK (head = a new branch in TARGET_REPO, base = TARGET_REPO default
   branch — never target the upstream repo). Each PR does a small real file change so it has a diff.
   - 1 draft PR
   - 1 PR whose head commit triggers a REAL failing GitHub Actions check (see step 5)
   - the rest open, normal
5) Failing CI: add .github/workflows/ci.yml that runs a step which exits non-zero on a specific
   branch/marker, so one PR's check-runs returns conclusion=failure for real.
6) Reviewer load: concentrate load on one person.
   - LOAD_MODE=reviewers: request OVERLOAD_REVIEWER as reviewer on 5-6 of the open PRs
     (they must be a collaborator).
   - LOAD_MODE=assignees: assign my username to 5-6 open PRs/issues instead.
7) Idempotency: support `--reset` that closes/removes everything the seeder created (tag seeded
   items with a marker label "seeded" so reset is safe and doesn't touch anything else).
8) On success, print a summary table: issues created, milestone due date, PRs by state, which PR
   has the failing check, and the reviewer/assignee load count per user — so I can verify every
   risk category fires before I build the agent.

CONSTRAINTS
- Fine-grained token only, scoped to TARGET_REPO. No org calls.
- Handle GitHub secondary rate limits with small backoff between writes.
- Pure Node/TS, Octokit REST, no extra services.
- Don't invent a sprint-model type yet — just produce the raw seeded state; I'll freeze the model
  shape against it next.

ACCEPTANCE
Running `pnpm seed` leaves TARGET_REPO with: a near-due milestone, ~10 issues (2 blocked, 2-3
closed), 5 PRs (1 draft, 1 with a real failing check), and one user carrying a visible review/
assignee load. `pnpm seed --reset` cleanly removes all of it.
```

### After the seeder runs

Verify the summary table shows all six: near-due milestone, blocked issues, a draft PR, a real failing check, the reviewer/assignee pile-up, and closed issues for velocity. Only then freeze the sprint-model shape and start on the agent — same order as the build plan.

Want me to write the sprint-model TypeScript shape next, so you can hand it to Claude Code the moment the seeder verifies?





  



Opus 4.8 High







[Claude is AI and can make mistakes. Please double-check responses.](https://support.anthropic.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on)

Share

### Content

![AI Automation Assignment – Full Stack AI Software Engineer.pdf](/api/3f17becf-f326-4b35-9803-9568e9070a03/files/80cd8d5a-5868-4c3c-a570-4b4aea399fc1/thumbnail)

pdf

### AI Automation Assignment – Full Stack AI Software Engineer.md

292 lines

md

### claude-ai-research-brief.md

128 lines

md