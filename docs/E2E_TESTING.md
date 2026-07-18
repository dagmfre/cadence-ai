# Cadence — End-to-End Testing Guide

This walks you through testing the whole system by hand, from an empty repo to the
full closed loop (Cadence changing GitHub + Slack), and back to a clean state.

> **The one thing being graded:** Cadence doesn't just *report* risk — it **acts**.
> It labels risky PRs, comments on stalled ones, posts a Slack report, and DMs
> owners. The whole point of this guide is to prove that "notify → do" works, then
> undo it so your demo repo stays fresh.

Your shell is **PowerShell**. Every command below has a PowerShell version. Where a
Git Bash version differs, it's noted.

---

## 0. One-time setup (do this once)

```powershell
pnpm install          # install dependencies
pnpm approve-builds   # IMPORTANT: pick "esbuild" and confirm — see note below
```

**Why `pnpm approve-builds`?** Your newer pnpm refuses to run a dependency's build
script (esbuild) until you approve it, and it *errors out* on that check when you run
`pnpm dev`. Approving esbuild once fixes it permanently. If you skip this, `pnpm dev`
fails before it even starts — you'd have to fall back to running `tsx` directly
(shown in Troubleshooting).

Your `.env` is already filled in (GitHub token, Gemini key, all three Slack tokens,
Upstash Redis, team map). Nothing else to configure.

---

## 1. What each command means

These are the npm scripts (defined in `package.json`). Run them from the project root.

| Command | What it does | Writes anything? |
|---|---|---|
| `pnpm run typecheck` | Runs the TypeScript compiler in check-only mode (`tsc --noEmit`). This is our safety net — no test suite this sprint. | No |
| `pnpm seed` | Fills the demo repo (`dagmfre/better-auth`) with every risk signal: a milestone (the sprint), issues, open PRs, a `blocked` label, a failing `delivery-check`, a review pile-up. | **Yes** — to GitHub |
| `pnpm seed --reset` | Removes everything the seeder created. Clean slate. | **Yes** — deletes from GitHub |
| `pnpm seed --board` | Spreads the Projects v2 board columns (Ready / In progress / In review / Done) so the board signal varies. | **Yes** — to the board |
| `pnpm scan` | Read-only. Fetches the sprint, runs the **deterministic** scoring (no AI), and prints the risk findings + forecast (RAG, completion %, projected slip). | No |
| `pnpm pipeline:dry` | Runs the **full Gemini pipeline** (risk → forecast → action) and prints the enriched findings, the forecast narrative, and the drafted action plan — but **applies nothing**. Safe to run over and over. | No |
| `pnpm dev` | Starts the server (Fastify) on `http://localhost:8787`. Leave it running in its own terminal; you hit its endpoints from another. | No (by itself) |
| `pnpm reset:actions` | The undo button. Removes `at-risk` labels, deletes Cadence's comments, deletes the bot's Slack messages. Puts the repo + Slack back to demo-fresh. | **Yes** — cleans up GitHub + Slack |

And these are the **HTTP endpoints** (the server from `pnpm dev` must be running):

| Endpoint | What it does | Writes anything? |
|---|---|---|
| `GET /api/scan` | Same as `pnpm scan`, but over HTTP. Also caches the result. | No |
| `POST /run-daily-scan` | **THE closed loop.** Scan → Gemini pipeline → act (depending on autonomy mode) → record the run. This is the graded action. | **Yes** (in copilot/autopilot) |
| `GET /api/pending` | Lists actions waiting for your approval (only used in copilot mode). | No |
| `POST /api/approve/:id` | Applies one queued action (label / comment / DM). | **Yes** |
| `POST /api/dismiss/:id` | Throws away one queued action. | No |
| `GET /api/runs` | History of past runs (forecast, report, what was applied). | No |

---

## 2. The autonomy dial (how much Cadence is allowed to do)

Set with the `AUTONOMY` environment variable. It decides what `/run-daily-scan` does:

| Mode | Behaviour |
|---|---|
| `observe` | Drafts everything, applies nothing. (Report is still posted so the product is visible.) |
| `copilot` *(default)* | Posts the Slack report, then **queues** the GitHub writes + DMs for you to approve via `/api/approve/:id`. |
| `autopilot` | Applies **everything** immediately — labels, comments, Slack report, DMs. This is the cleanest single-shot demo of "notify → do". |

Set it for a server session:

```powershell
$env:AUTONOMY = 'autopilot'   # PowerShell — applies to the next `pnpm dev`
```
```bash
AUTONOMY=autopilot pnpm dev    # Git Bash — one-liner
```

---

## 3. Important: the staleness gotcha (read before seeding)

Some risk rules (stalled PR, parked draft, board stagnation) only fire when an item
hasn't been touched for longer than `STALE_THRESHOLD_MINUTES` (default **30**).

Right after you seed, every item is brand-new — so those "stale" signals **won't fire
for 30 minutes**. Only the instant signals (blocked label, failing CI, review pile-up)
show up immediately.

**Two ways to handle it when testing:**
- **Fast test (recommended while iterating):** lower the threshold so everything fires
  right away:
  ```powershell
  $env:STALE_THRESHOLD_MINUTES = '0'
  ```
- **Realistic demo:** seed 30+ minutes before you record, and keep the default 30. By
  showtime the items have "aged" and the full signal set fires naturally.

---

## 4. The full end-to-end test (happy path)

Do these in order. Steps 1–3 are safe (read-only or self-cleaning). Step 5 is the real
write. Step 7 undoes it.

### Step 1 — Typecheck (sanity)
```powershell
pnpm run typecheck
```
Expect: `TYPECHECK_OK` (well, a clean exit — no errors printed).

### Step 2 — Seed the repo
```powershell
pnpm seed --reset   # start clean (safe even if nothing exists yet)
pnpm seed           # create the milestone, issues, PRs, labels, failing check
pnpm seed --board   # spread the board columns
```
Expect: log lines like `created milestone`, `created issue #…`, `opened PR #…`,
`labeled #… blocked`. Open the repo in a browser to eyeball it.

### Step 3 — Scan (deterministic, no AI, no writes)
```powershell
pnpm scan
```
Expect: the sprint header, a list of findings (blocked, failing-ci, review-bottleneck,
and — if items are stale enough — stalled-pr / parked-draft / board-stagnation), and a
forecast with a RAG colour and completion %. **This proves the ingest + scoring work
before any AI or writes are involved.**

### Step 4 — Dry run (full AI pipeline, still no writes)
```powershell
pnpm pipeline:dry
```
Expect: the same findings but now **enriched by Gemini** — each has a `rootCause` and a
`recommendedAction` that cite real evidence — plus a forecast narrative and a fully
drafted action plan (which labels/comments it *would* post, the Slack report text, the
owner messages). Nothing is applied. **This proves the AI pipeline works end-to-end,
safely.** Run it as many times as you like.

> Heads-up on speed: the pipeline makes 3 sequential Gemini calls with small cushions
> for the free-tier rate limit. On a throttled free key it can take anywhere from ~20
> seconds to a couple of minutes. That's expected — let it finish.

### Step 5 — The real closed loop (this is the graded moment)
Open **two terminals**.

**Terminal A** — start the server in autopilot:
```powershell
$env:AUTONOMY = 'autopilot'
pnpm dev
```
Wait for `Cadence server on :8787`.

**Terminal B** — fire the run:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8787/run-daily-scan `
  -ContentType 'application/json' -Body '{"trigger":"manual"}'
```
```bash
# Git Bash alternative:
curl -X POST http://localhost:8787/run-daily-scan -H "Content-Type: application/json" -d '{"trigger":"manual"}'
```
Expect (after it finishes): a JSON response with `run.applied` — a human-readable log
like `report: posted to C0BK…`, `labeled #7 "at-risk"`, `commented on #7`,
`dm → dagmfre`.

### Step 6 — Verify it actually happened
- **GitHub:** open the repo → risky PRs/issues now carry an `at-risk` label, and
  stalled ones have a Cadence comment (signed *"— Cadence · delivery bot"*).
- **Slack:** the channel has the delivery report (RAG headline, forecast, top risks +
  next actions); mapped owners got a DM.
- **History:**
  ```powershell
  Invoke-RestMethod http://localhost:8787/api/runs
  ```
  The run is recorded.

**If you're in copilot mode instead of autopilot**, the GitHub writes are queued, not
applied. Check and approve them:
```powershell
Invoke-RestMethod http://localhost:8787/api/pending           # list queued actions (note an id)
Invoke-RestMethod -Method Post -Uri http://localhost:8787/api/approve/PASTE_ID_HERE
```

### Step 7 — Reset to demo-fresh
Stop the server (Ctrl+C in Terminal A), then:
```powershell
pnpm reset:actions
```
Expect: `GitHub: removed at-risk #…; deleted comment …` and `Slack: deleted N bot
message(s)`. Now the repo + Slack look untouched — ready for the next take.

> `reset:actions` only removes **Cadence's own** writes (it finds its comments by a
> hidden marker and only strips the `at-risk` label). It never touches the seeded
> issues/PRs themselves. To wipe the seed data too, use `pnpm seed --reset`.

---

## 5. Recommended flow for recording the video

1. **Before the camera:** `pnpm seed --reset` → `pnpm seed` → `pnpm seed --board`
   (ideally 30+ min before, so staleness signals are live). Run `pnpm pipeline:dry`
   once to confirm the AI is responding today.
2. **On camera:** show `pnpm scan` (the read), then fire `POST /run-daily-scan` in
   autopilot, then cut to GitHub + Slack showing the labels, comments, report, DMs.
3. **Between takes:** `pnpm reset:actions` and go again.

---

## 5b. The dashboard (Phase 4)

- **Dev:** two terminals — `pnpm dev` (server :8787) + `pnpm web` (Vite :5173, proxies /api).
- **Prod-like (what Koyeb runs):** `pnpm web:build` then `pnpm start` — the server serves `web/dist` itself, everything on `http://localhost:8787`.
- Screens: `/wizard` (connect flow — resumes at the first incomplete step), `/` Overview (RAG banner + risks + board + items), `/actions` (pending approvals + Run scan now + history), `/chat` (same agent as Slack), `/settings` (autonomy + roster).
- The chat and Slack threads share the same agent; conversations persist in Upstash across restarts.

## 5c. Accounts & multi-account isolation

Cadence has real accounts (email + password, scrypt-hashed, httpOnly session cookie).
**Each account gets its own workspace** — its own repo/board/Slack connection, runs,
pending actions and chat. The `.env` values are *not* inherited by web accounts; they
configure the headless workspace only (CLI + cron).

Check it yourself:

```powershell
# 1. register account A, connect it via the wizard, run a scan
# 2. sign out, register account B
#    → B must land on the wizard with an EMPTY workspace: no repo, no runs, no chat
# 3. sign back in as A → A's workspace is exactly as it was
```

If a brand-new account ever shows someone else's repo, that's the isolation bug —
report it.

## 5d. Deploying (Koyeb)

Build: `pnpm install && pnpm --dir web build` · Run: `pnpm start`

| Env var | Why it matters |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | **Required.** Without them the server uses an in-memory store and every restart wipes all accounts and sessions. |
| `NODE_ENV=production` | Makes the session cookie `Secure`. |
| `PORT` | Must match the port Koyeb exposes (e.g. `8000`). |
| `CRON_SECRET` | Lets the scheduler call `/run-daily-scan`; it can't sign in. |
| `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` | The pipeline and chat. Set either or both — the model picker on Actions/Chat lists only providers you have a key for. `CADENCE_MODEL` sets the default. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | The wizard's "Sign in with GitHub". Callback must be `https://<your-app>/auth/github/callback`. |
| `GITHUB_TOKEN_CLASSIC`, `TARGET_REPO`, `SLACK_*`, `TEAM_MAP`, `AUTONOMY` | The headless workspace the cron scan and the `@Cadence` Slack listener act on. |
| `LANGSMITH_TRACING` / `_API_KEY` / `_PROJECT` | Optional. Traces every run and chat turn — see §5d-bis. |

Daily trigger (cron-job.org), preferring the header form:

```
POST https://<your-app>.koyeb.app/run-daily-scan
Header: Authorization: Bearer <CRON_SECRET>
Body:   {"trigger":"daily"}
```

`?key=<CRON_SECRET>` also works if your scheduler only accepts a URL — note that a
query string lands in access logs, so treat those logs as secret.

## 5d-bis. LangSmith tracing (every run is a trace)

Set three variables (locally in `.env`, in production as Koyeb env vars):

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...        # smith.langchain.com → Settings → API keys
LANGSMITH_PROJECT=cadence
```

On boot the server prints which mode it's in:

```
LangSmith tracing on → project "cadence"
```

What you get in the LangSmith UI, per project:

| Trace name | When | What's nested inside |
|---|---|---|
| `cadence-run` | every scan (cron **and** "Run scan now") | `scan` (deterministic GitHub read + scoring) → the LangGraph pipeline nodes (risk/root-cause, forecast narrative, action plan) with their Gemini calls → `execute-plan` (what was actually written) |
| `cadence-chat` | every chat turn, web **and** Slack | the tool-calling loop: `get_latest_scan`, `get_item_timeline`, `propose_action`, and each Gemini call |

Each `cadence-run` trace carries `trigger` (`daily`/`manual`) and `workspace` metadata,
so you can tell a cron run from a demo click and one account's runs from another's.
Tracing is entirely opt-in: with `LANGSMITH_TRACING` unset the SDK is inert and the
pipeline runs exactly as before.

## 5e. Known limitations (deliberate, documented)

- **Single instance.** The OAuth-state set, the login rate limiter and the
  in-flight-scan registry are in-memory, so running two replicas would break OAuth,
  weaken throttling, and let two replicas each start their own scan.
- **Slack `@Cadence` answers for the headless workspace only.** Per-account Slack
  routing needs a Slack-team → account mapping; the web app is fully per-account.
- **Concurrent writes can drop an item.** Approving an action while a scan is
  appending uses read-modify-write on Redis without a transaction. Fine at demo
  concurrency; would need atomic ops for real multi-user load.
- **A repo needs an open milestone.** Cadence treats a milestone as the sprint; a
  repo without one shows setup guidance rather than a forecast.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `pnpm dev` fails with `ERR_PNPM_IGNORED_BUILDS` | You skipped `pnpm approve-builds`. Run it and pick esbuild. Or bypass pnpm entirely: `./node_modules/.bin/tsx server/src/index.ts`. |
| `EADDRINUSE: 0.0.0.0:8787` | A server is already running on that port. Stop it, or run on another port: `$env:PORT='8790'; pnpm dev` (then hit `:8790`). |
| `GITHUB_TOKEN_CLASSIC missing in .env` | You're running from the wrong folder, or `.env` isn't loaded. Run commands from the project root. |
| The run hangs for minutes | Gemini free-tier rate limiting → retries with backoff. Let it finish, or set `$env:GEMINI_MODEL` to fall back to `gemini-2.5-flash`. Space out repeated runs. |
| Scan shows fewer findings than expected | The stale-based rules haven't tripped yet. Set `$env:STALE_THRESHOLD_MINUTES='0'` (see §3). |
| `curl` behaves oddly in PowerShell | In PowerShell, `curl` is an alias for `Invoke-WebRequest`, not real curl. Use `Invoke-RestMethod` (shown above) or call `curl.exe` explicitly. |
| Nothing posts to Slack | Confirm the bot is invited to the channel (`SLACK_CHANNEL_ID`) and the tokens in `.env` are valid. |
| “No open milestone” on the dashboard | Expected for a repo with no milestone. Create one with a due date and add the sprint's issues, then Scan again. |
| Signed out unexpectedly | The session cookie lasts 30 days; it is also dropped whenever the store restarts without Upstash configured. |
| `429 Too many attempts` on sign-in | The per-IP limiter (10 tries / 5 min). Wait it out. |
| `502` / `504` from "Run scan now" | Fixed: a run takes ~3 min, longer than Koyeb's ~60s edge timeout, so the server now acknowledges with `202` and the dashboard polls `/api/scan-status`. If you still see it, you're on a build from before that change. |
| The Run-scan button spins forever | The dashboard gives up after 10 min with a message; the run itself keeps going and lands in run history. Check the service logs for the real failure. |
| No traces in LangSmith | The boot log says which mode it's in. `LANGSMITH_TRACING` must be exactly `true` **and** `LANGSMITH_API_KEY` set; non-US accounts also need `LANGSMITH_ENDPOINT`. |
| Findings show no root cause / "the analysis model was unavailable" | The model failed (rate limit, or a repetition loop that blew the output cap) and the run degraded to the deterministic scan instead of dying. The numbers and findings are still real. Check the server log for `[pipeline] … node degraded`, then re-run — or switch model in the picker. |
| The model picker doesn't appear | It hides when fewer than two models are available. Add the second provider's API key. |
| Cron returns 401 | `CRON_SECRET` isn't set on the host, or the scheduler isn't sending it (see §5d). |

---

## 7. What "reversible" guarantees (peace of mind)

- **GitHub:** every Cadence comment carries a hidden `<!-- cadence-bot -->` marker;
  `reset:actions` deletes exactly those and strips only the `at-risk` label it added.
  Your seeded issues/PRs are untouched.
- **Slack:** `reset:actions` deletes the messages the bot itself posted (report + DMs).
- **State:** run history lives in Upstash Redis; it's just a log and doesn't affect the
  repo. It has no bearing on how fresh the demo looks.

So a real run is fully undoable — but the smartest habit is to rehearse with
`pipeline:dry` (zero writes) and spend the real `/run-daily-scan` on the actual
recording.
