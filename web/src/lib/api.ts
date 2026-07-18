/** Typed client for the Cadence server API (mirrors server/src/model.ts). */

export interface DeliveryItem {
  number: number;
  type: "issue" | "pr";
  title: string;
  url: string;
  author: string;
  assignees: string[];
  requestedReviewers: string[];
  labels: string[];
  state: "open" | "closed";
  draft: boolean;
  ciStatus: "passing" | "failing" | "pending" | "none";
  boardStatus: string | null;
  updatedAt: string;
}

export interface RiskFinding {
  itemNumber: number;
  category: string;
  severity: "low" | "medium" | "high";
  reason: string;
  rootCause?: string;
  recommendedAction?: string;
}

export interface Forecast {
  completionLikelihood: number;
  projectedSlipDays: number;
  rag: "red" | "amber" | "green";
  daysLeft: number;
  narrative?: string;
}

export interface ScanResult {
  model: {
    repo: string;
    sprint: { number: number; title: string; dueOn: string | null; openCount: number; closedCount: number };
    items: DeliveryItem[];
    reviewerLoad: Record<string, number>;
    assigneeLoad: Record<string, number>;
    closedLast7Days: number;
    fetchedAt: string;
  };
  findings: RiskFinding[];
  forecast: Forecast;
}

export interface PendingAction {
  id: string;
  kind: "label" | "comment" | "dm";
  itemNumber?: number;
  githubLogin?: string;
  value: string;
  createdAt: string;
  status: string;
}

export interface RunRecord {
  id: string;
  at: string;
  trigger: "daily" | "manual";
  forecast: Forecast;
  findingCount: number;
  report: string;
  applied: string[];
}

export interface ModelChoice {
  id: string;
  label: string;
  provider: string;
  note: string;
}

export interface ScanStatus {
  running: boolean;
  startedAt: string | null;
  error: string | null;
  lastRun: RunRecord | null;
}

export interface Workspace {
  githubConnected: boolean;
  githubLogin: string | null;
  repo: string | null;
  projectNumber: number | null;
  slackConnected: boolean;
  slackChannelId: string | null;
  teamMap: Record<string, string>;
  autonomy: "observe" | "copilot" | "autopilot";
}

export interface RosterEntry {
  githubLogin: string;
  slackId: string | null;
  slackName: string | null;
  confidence: "saved" | "high" | "medium" | "unmatched";
}

export interface ConvoMessage {
  role: "user" | "assistant";
  text: string;
  ts: string;
  proposedAction?: Omit<PendingAction, "id" | "createdAt" | "status">;
  executed?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Session-expiry handling. Without this every page invents its own misleading
 * message ("Scan failed: Not signed in") instead of returning to the sign-in screen.
 */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    credentials: "same-origin", // session cookie
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (r.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized?.();
    // Fastify's default shape puts the useful text in `message` and a generic
    // status name in `error` — prefer whichever actually says something.
    const generic = !body?.error || /^(internal server error|bad request|conflict|not found)$/i.test(body.error);
    const message = (generic ? body?.message : body?.error) || body?.error || `${r.status} ${r.statusText}`;
    throw new ApiError(message, r.status);
  }
  return r.json() as Promise<T>;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export interface AuthUser {
  email: string;
}

export const api = {
  me: () => req<{ user: AuthUser | null }>("/api/auth/me"),
  register: (email: string, password: string) => req<AuthUser>("/api/auth/register", post({ email, password })),
  login: (email: string, password: string) => req<AuthUser>("/api/auth/login", post({ email, password })),
  logout: () => req<{ signedOut: true }>("/api/auth/logout", post()),
  workspace: () => req<Workspace>("/api/workspace"),
  scan: () => req<ScanResult>("/api/scan"),
  runDailyScan: () => req<{ accepted: true; startedAt: string }>("/run-daily-scan", post({ trigger: "manual" })),
  scanStatus: () => req<ScanStatus>("/api/scan-status"),
  pending: () => req<PendingAction[]>("/api/pending"),
  approve: (id: string) => req<{ applied: string }>(`/api/approve/${id}`, post()),
  dismiss: (id: string) => req<{ dismissed: string }>(`/api/dismiss/${id}`, post()),
  runs: () => req<RunRecord[]>("/api/runs"),
  chat: () => req<ConvoMessage[]>("/api/chat"),
  chatSend: (message: string) =>
    req<{ reply: string; proposedAction?: ConvoMessage["proposedAction"] }>("/api/chat", post({ message })),
  chatConfirm: () => req<{ reply: string }>("/api/chat/confirm", post()),
  chatClear: () => req<{ cleared: true }>("/api/chat", { method: "DELETE" }),
  wizardGithubPat: (token: string) => req<{ login: string }>("/api/wizard/github", post({ token })),
  wizardRepos: () => req<{ fullName: string; private: boolean; openIssues: number }[]>("/api/wizard/repos"),
  wizardBoards: () => req<{ number: number; title: string }[]>("/api/wizard/boards"),
  wizardRepo: (repo: string, projectNumber: number | null) => req<{ saved: true }>("/api/wizard/repo", post({ repo, projectNumber })),
  wizardSlack: (botToken?: string, channelId?: string) =>
    req<{ team?: string; channels?: { id: string; name: string; isMember: boolean }[]; saved?: boolean }>(
      "/api/wizard/slack",
      post({ botToken, channelId }),
    ),
  wizardRoster: () =>
    req<{ roster: RosterEntry[]; slackMembers: { id: string; name: string; realName: string }[]; note?: string | null }>(
      "/api/wizard/roster",
    ),
  wizardComplete: (teamMap: Record<string, string>, autonomy: Workspace["autonomy"]) =>
    req<{ connected: true }>("/api/wizard/complete", post({ teamMap, autonomy })),
  settings: (patch: { autonomy?: Workspace["autonomy"]; teamMap?: Record<string, string>; model?: string }) =>
    req<{ saved: true }>("/api/settings", post(patch)),
  models: () => req<{ models: ModelChoice[]; current: string }>("/api/models"),
};

/**
 * A run takes 1-4 minutes — longer than any proxy will hold a request open — so the
 * server acknowledges immediately and we follow it. `resume` attaches to a scan that
 * was already running (e.g. the page was reloaded mid-run) instead of starting a new one.
 */
export async function followScan(opts: { resume?: boolean } = {}): Promise<RunRecord | null> {
  const previousRunId = (await api.scanStatus().catch(() => null))?.lastRun?.id ?? null;
  if (!opts.resume) await api.runDailyScan();

  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await api.scanStatus();
    if (status.error) throw new Error(status.error);
    if (!status.running) {
      // A finished run we didn't see before is this one; otherwise it ended without recording.
      return status.lastRun && status.lastRun.id !== previousRunId ? status.lastRun : null;
    }
    if (Date.now() > deadline) throw new Error("The scan is taking unusually long — check the run history in a moment.");
  }
}

export const ragColor = { red: "text-rag-red", amber: "text-rag-amber", green: "text-rag-green" } as const;
export const severityColor = { high: "text-rag-red", medium: "text-rag-amber", low: "text-muted-foreground" } as const;
