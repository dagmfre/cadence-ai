/**
 * The frozen sprint-model contract (DECISIONS §11, PRODUCT_FLOWS).
 * Zod schemas double as LLM structured-output schemas in the agent pipeline.
 */
import { z } from "zod";

export const BoardStatus = z.enum(["Backlog", "Ready", "In progress", "In review", "Done"]);

export const DeliveryItemSchema = z.object({
  number: z.number(),
  type: z.enum(["issue", "pr"]),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  assignees: z.array(z.string()),
  requestedReviewers: z.array(z.string()),
  labels: z.array(z.string()),
  state: z.enum(["open", "closed"]),
  draft: z.boolean(),
  ciStatus: z.enum(["passing", "failing", "pending", "none"]),
  boardStatus: BoardStatus.nullable(),
  updatedAt: z.string(),
  linkedIssueNumbers: z.array(z.number()),
});
export type DeliveryItem = z.infer<typeof DeliveryItemSchema>;

export const SprintSchema = z.object({
  number: z.number(),
  title: z.string(),
  dueOn: z.string().nullable(),
  openCount: z.number(),
  closedCount: z.number(),
});
export type Sprint = z.infer<typeof SprintSchema>;

export const SprintModelSchema = z.object({
  repo: z.string(),
  sprint: SprintSchema,
  items: z.array(DeliveryItemSchema),
  /** login → count of reviews requested from them across open PRs */
  reviewerLoad: z.record(z.string(), z.number()),
  /** login → count of open items assigned to them */
  assigneeLoad: z.record(z.string(), z.number()),
  /** issues closed in the last 7 days (velocity basis) */
  closedLast7Days: z.number(),
  fetchedAt: z.string(),
});
export type SprintModel = z.infer<typeof SprintModelSchema>;

export const RiskCategory = z.enum([
  "stalled-pr",
  "blocked-issue",
  "failing-ci",
  "review-bottleneck",
  "board-stagnation",
  "status-mismatch",
  "unassigned-at-risk",
  "parked-draft",
]);

export const RiskFindingSchema = z.object({
  itemNumber: z.number(),
  category: RiskCategory,
  severity: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  rootCause: z.string().optional(),
  recommendedAction: z.string().optional(),
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

export const ForecastSchema = z.object({
  completionLikelihood: z.number().min(0).max(100),
  projectedSlipDays: z.number(),
  rag: z.enum(["red", "amber", "green"]),
  daysLeft: z.number(),
  narrative: z.string().optional(),
});
export type Forecast = z.infer<typeof ForecastSchema>;

export const GithubActionSchema = z.object({
  kind: z.enum(["label", "comment"]),
  itemNumber: z.number(),
  /** label name for kind=label, comment body for kind=comment */
  value: z.string(),
});
export const OwnerMessageSchema = z.object({
  githubLogin: z.string(),
  text: z.string(),
});
export const ActionPlanSchema = z.object({
  githubActions: z.array(GithubActionSchema),
  slackReport: z.string(),
  ownerMessages: z.array(OwnerMessageSchema),
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const ScanResultSchema = z.object({
  model: SprintModelSchema,
  findings: RiskFindingSchema.array(),
  forecast: ForecastSchema,
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
