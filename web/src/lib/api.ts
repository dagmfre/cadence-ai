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

export interface Workspace {
  githubConnected: boolean;
  githubLogin: string | null;
  repo: string | null;
  projectNumber: number;
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const api = {
  workspace: () => req<Workspace>("/api/workspace"),
  scan: () => req<ScanResult>("/api/scan"),
  runDailyScan: () =>
    req<{ run: RunRecord; findings: RiskFinding[] }>("/run-daily-scan", post({ trigger: "manual" })),
  pending: () => req<PendingAction[]>("/api/pending"),
  approve: (id: string) => req<{ applied: string }>(`/api/approve/${id}`, post()),
  dismiss: (id: string) => req<{ dismissed: string }>(`/api/dismiss/${id}`, post()),
  runs: () => req<RunRecord[]>("/api/runs"),
  chat: () => req<ConvoMessage[]>("/api/chat"),
  chatSend: (message: string) =>
    req<{ reply: string; proposedAction?: ConvoMessage["proposedAction"] }>("/api/chat", post({ message })),
  chatConfirm: () => req<{ reply: string }>("/api/chat/confirm", post()),
  wizardGithubPat: (token: string) => req<{ login: string }>("/api/wizard/github", post({ token })),
  wizardRepos: () => req<{ fullName: string; private: boolean; openIssues: number }[]>("/api/wizard/repos"),
  wizardBoards: () => req<{ number: number; title: string }[]>("/api/wizard/boards"),
  wizardRepo: (repo: string, projectNumber?: number) => req<{ saved: true }>("/api/wizard/repo", post({ repo, projectNumber })),
  wizardSlack: (botToken?: string, channelId?: string) =>
    req<{ team?: string; channels?: { id: string; name: string; isMember: boolean }[]; saved?: boolean }>(
      "/api/wizard/slack",
      post({ botToken, channelId }),
    ),
  wizardRoster: () => req<{ roster: RosterEntry[]; slackMembers: { id: string; name: string; realName: string }[] }>("/api/wizard/roster"),
  wizardComplete: (teamMap: Record<string, string>, autonomy: Workspace["autonomy"]) =>
    req<{ connected: true }>("/api/wizard/complete", post({ teamMap, autonomy })),
  settings: (patch: { autonomy?: Workspace["autonomy"]; teamMap?: Record<string, string> }) =>
    req<{ saved: true }>("/api/settings", post(patch)),
};

export const ragColor = { red: "text-rag-red", amber: "text-rag-amber", green: "text-rag-green" } as const;
export const severityColor = { high: "text-rag-red", medium: "text-rag-amber", low: "text-muted-foreground" } as const;
