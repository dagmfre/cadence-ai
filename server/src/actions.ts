/**
 * Action executor (DECISIONS §14): applies an ActionPlan per the autonomy dial.
 * observe  → draft everything, apply nothing
 * copilot  → post the report; queue GitHub writes + DMs for approval (default)
 * autopilot→ apply + send everything, log it
 */
import { ActionPlan } from "./model.js";
import { addLabel, comment } from "./github.js";
import { notifyOwner, postReport } from "./slack.js";
import { PendingAction, store } from "./store.js";
import { getWorkspace } from "./workspace.js";

export type Autonomy = "observe" | "copilot" | "autopilot";
/** Workspace-backed autonomy dial (env fallback inside getWorkspace). */
export const autonomyMode = async (): Promise<Autonomy> => (await getWorkspace()).autonomy;

let seq = 0;
const pendingFrom = (a: Omit<PendingAction, "id" | "createdAt" | "status">): PendingAction => ({
  ...a,
  id: `${Date.now()}-${seq++}`,
  createdAt: new Date().toISOString(),
  status: "pending",
});

export async function executeOne(a: PendingAction): Promise<string> {
  if (a.kind === "label") {
    await addLabel(a.itemNumber!, a.value);
    return `labeled #${a.itemNumber} "${a.value}"`;
  }
  if (a.kind === "comment") {
    await comment(a.itemNumber!, a.value);
    return `commented on #${a.itemNumber}`;
  }
  return await notifyOwner(a.githubLogin!, a.value);
}

/** Returns a human-readable log of what was applied vs queued. */
export async function executePlan(plan: ActionPlan, mode?: Autonomy): Promise<string[]> {
  mode ??= await autonomyMode();
  const log: string[] = [];
  const queue: PendingAction[] = [];

  // The report is informational — posted in every mode except observe-drafting it too would hide the product
  log.push(`report: ${await postReport(plan.slackReport)}`);

  const candidates: PendingAction[] = [
    ...plan.githubActions.map((g) => pendingFrom({ kind: g.kind, itemNumber: g.itemNumber, value: g.value })),
    ...plan.ownerMessages.map((m) => pendingFrom({ kind: "dm", githubLogin: m.githubLogin, value: m.text })),
  ];

  for (const a of candidates) {
    if (mode === "autopilot") log.push(await executeOne(a).catch((e) => `FAILED ${a.kind}: ${e.message}`));
    else queue.push(a);
  }

  if (queue.length) {
    const existing = await store.getPending();
    await store.setPending([...existing, ...queue]);
    log.push(`${queue.length} action(s) queued for approval (${mode} mode)`);
  }
  return log;
}
