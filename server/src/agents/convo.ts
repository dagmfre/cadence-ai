/**
 * Conversational agent (D15/D19, PRODUCT_FLOWS W3): a small tool-calling loop —
 * separate from the 3-node pipeline. Answers with item-level evidence from the
 * sprint model; PROPOSES actions but never executes them itself — execution
 * happens deterministically here when the user confirms ("do it"). Same agent
 * behind web chat and Slack threads; conversation persisted per convoId.
 * Grounded: LangChain docs — bindTools + tool(); Gemini forbids z.record/empty
 * tool schemas, so every schema has explicit properties.
 */
import { traceable } from "langsmith/traceable";
import { tool } from "@langchain/core/tools";
import { ToolMessage, type BaseMessageLike } from "@langchain/core/messages";
import { z } from "zod";
import { modelBrief } from "./pipeline.js";
import { currentLlm } from "../llm.js";
import { runScan } from "../scan.js";
import { getItemTimeline } from "../github.js";
import { autonomyMode, executeOne } from "../actions.js";
import { store, type ConvoMessage } from "../store.js";
import { currentWorkspaceId } from "../context.js";

type Proposal = NonNullable<ConvoMessage["proposedAction"]>;

const AFFIRMATIVE = /^(y(es|ep|eah)?|do it|go ahead|approve|confirm|ok(ay)?|sure|ship it|apply|send it)\b/i;

/** Enough rounds to read the scan plus a few item timelines before we stop paying. */
const MAX_TOOL_ROUNDS = 6;

const now = () => new Date().toISOString();

export interface ConvoReply {
  reply: string;
  proposedAction?: Proposal;
}

async function convo(convoId: string, userText: string): Promise<ConvoReply> {
  const history = await store.getConvo(convoId);
  const text = userText.trim();

  // Deterministic confirm path: affirmative reply + an unexecuted proposal on the table.
  const lastProposal = [...history].reverse().find((m) => m.proposedAction && !m.executed);
  if (lastProposal && AFFIRMATIVE.test(text)) {
    let reply: string;
    if ((await autonomyMode()) === "observe") {
      reply = "I'm in observe mode, so I can't apply actions — switch to copilot or autopilot and ask again.";
    } else {
      // Claim the proposal BEFORE executing, so two fast "do it"s can't double-apply.
      const p = lastProposal.proposedAction!;
      lastProposal.executed = true;
      await store.setConvo(convoId, history);
      const result = await executeOne({ ...p, id: `chat-${Date.now()}`, createdAt: now(), status: "approved" }).catch(
        (e: Error) => `failed: ${e.message}`,
      );
      reply = `Done — ${result}.`;
    }
    await saveTurn(convoId, history, text, { reply });
    return { reply };
  }

  // Tool-calling loop. propose_action is captured out-of-band — the LLM never executes.
  let proposal: Proposal | undefined;
  const tools = [
    tool(
      async ({ refresh }) => {
        const cached = refresh ? null : await store.getLastScan();
        const scan = cached ?? (await runScan());
        if (!cached) await store.setLastScan(scan);
        return modelBrief(scan);
      },
      {
        name: "get_latest_scan",
        description: "The scored sprint model: sprint, forecast (RAG), risk findings, reviewer/assignee load, items.",
        schema: z.object({ refresh: z.boolean().optional().describe("true = re-fetch from GitHub instead of the cache") }),
      },
    ),
    tool(async ({ itemNumber }) => (await getItemTimeline(itemNumber)).join("\n") || "(no events)", {
      name: "get_item_timeline",
      description: "Recent GitHub timeline events of one issue/PR — evidence for root-cause claims.",
      schema: z.object({ itemNumber: z.number().describe("the issue/PR number") }),
    }),
    tool(
      async (p) => {
        proposal = p;
        return "Proposal recorded. Present it to the user and ask for confirmation — do not claim it was executed.";
      },
      {
        name: "propose_action",
        description:
          "Propose ONE closed-loop action for the user to confirm: a GitHub label ('at-risk'/'blocked'), a GitHub comment, or a Slack DM to an owner. Never executes.",
        schema: z.object({
          kind: z.enum(["label", "comment", "dm"]),
          itemNumber: z.number().optional().describe("required for label/comment"),
          githubLogin: z.string().optional().describe("required for dm"),
          value: z.string().describe("label name, comment body, or DM text"),
        }),
      },
    ),
  ];
  const llm = await currentLlm();
  const bound = llm.bindTools!(tools);
  // Union of tool signatures isn't callable — dispatch through one structural cast.
  const byName = new Map<string, { invoke: (args: unknown) => Promise<unknown> }>(
    tools.map((t) => [t.name, t as unknown as { invoke: (args: unknown) => Promise<unknown> }]),
  );

  const messages: BaseMessageLike[] = [
    {
      role: "system",
      content:
        "You are Cadence, an Engineering Delivery Manager AI in a chat with the team's Delivery Lead. " +
        "Answer delivery questions (e.g. 'why are we slipping?') with SPECIFIC evidence: cite item numbers, people, forecast numbers from your tools — never invent. " +
        "Call get_latest_scan first when you need sprint facts. When a concrete next step would help, call propose_action (one action) and end by asking the user to confirm. " +
        "Be concise: a few sentences, Slack-friendly formatting, no headings.",
    },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content: text },
  ];

  const dbg = (...a: unknown[]) => process.env.CONVO_DEBUG && console.warn("[convo]", ...a);
  let response = await bound.invoke(messages);
  for (let round = 0; round < MAX_TOOL_ROUNDS && response.tool_calls?.length; round++) {
    dbg(`round ${round}`, response.tool_calls.map((c) => c.name));
    messages.push(response);
    for (const call of response.tool_calls) {
      const result = await byName
        .get(call.name)
        ?.invoke(call.args)
        .catch((e: Error) => `tool error: ${e.message}`);
      messages.push(new ToolMessage({ content: String(result ?? "unknown tool"), tool_call_id: call.id ?? call.name }));
    }
    response = await bound.invoke(messages);
  }

  // The round budget guards against a runaway tool loop; it is not a reason to throw
  // away what the model already gathered. Running out used to answer "try rephrasing"
  // while a full sprint model and three item timelines sat unused in `messages`.
  // Ask again with the tools removed, so it has to answer from the evidence it has.
  if (!response.text) {
    dbg("no text after tool loop — forcing a final answer without tools");
    response = await llm.invoke([
      ...messages,
      {
        role: "user",
        content:
          "Answer now, using only the evidence you have already gathered above. " +
          "You cannot call any more tools. If something is genuinely missing, say what you do know and name what's missing.",
      },
    ]);
  }

  dbg("final", { text: response.text.slice(0, 80), toolCalls: response.tool_calls?.length, content: JSON.stringify(response.content).slice(0, 120) });
  const reply = response.text || "I couldn't form an answer — try rephrasing.";
  await saveTurn(convoId, history, text, { reply, proposedAction: proposal });
  return { reply, proposedAction: proposal };
}

async function saveTurn(convoId: string, history: ConvoMessage[], userText: string, out: ConvoReply) {
  history.push(
    { role: "user", text: userText, ts: now() },
    { role: "assistant", text: out.reply, ts: now(), ...(out.proposedAction && { proposedAction: out.proposedAction }) },
  );
  await store.setConvo(convoId, history);
  await store.trackConvoId(convoId);
}

export type ConvoSurface = "web" | "slack-dm" | "slack-thread";

/**
 * Each turn is one LangSmith trace, with the tool calls and model calls nested under it.
 * Tagged with where it came from: Slack and web run the identical agent, so without this
 * the traces are indistinguishable and you can't tell which surface a bad answer came from.
 *
 * The surface is passed in rather than guessed from the convoId format — the caller knows
 * it for certain, and an inference would mislabel silently the moment those ids change.
 * Wrapped per call because the metadata differs per conversation.
 */
export function runConvo(convoId: string, userText: string, surface: ConvoSurface): Promise<ConvoReply> {
  return traceable(convo, {
    name: "cadence-chat",
    run_type: "chain",
    metadata: { surface, convoId, workspace: currentWorkspaceId() ?? "default" },
  })(convoId, userText);
}
