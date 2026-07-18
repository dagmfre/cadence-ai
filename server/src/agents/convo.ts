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
import { llm, modelBrief } from "./pipeline.js";
import { runScan } from "../scan.js";
import { getItemTimeline } from "../github.js";
import { autonomyMode, executeOne } from "../actions.js";
import { store, type ConvoMessage } from "../store.js";

type Proposal = NonNullable<ConvoMessage["proposedAction"]>;

const AFFIRMATIVE = /^(y(es|ep|eah)?|do it|go ahead|approve|confirm|ok(ay)?|sure|ship it|apply|send it)\b/i;

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
  const bound = llm.bindTools(tools);
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
  for (let round = 0; round < 4 && response.tool_calls?.length; round++) {
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

/** Each turn is one LangSmith trace — the tool calls and model calls nest under it. */
export const runConvo = traceable(convo, { name: "cadence-chat", run_type: "chain" });
