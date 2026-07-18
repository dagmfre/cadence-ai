/**
 * Slack surface (DECISIONS §6, §13): report to the channel, DMs to mapped owners.
 * Workspace-driven (C1): tokens/channel/teamMap come from getWorkspace()
 * (wizard-connected config wins over env). No Slack config → warn-and-skip so
 * the pipeline never crashes.
 */
import { WebClient } from "@slack/web-api";
import { getWorkspace } from "./workspace.js";

const clients = new Map<string, WebClient>(); // per-token, so accounts don't thrash one slot
async function ctx(): Promise<{ client: WebClient | null; channel: string; teamMap: Record<string, string> }> {
  const ws = await getWorkspace();
  if (!ws.slackBotToken) return { client: null, channel: "", teamMap: {} };
  let client = clients.get(ws.slackBotToken);
  if (!client) {
    client = new WebClient(ws.slackBotToken);
    clients.set(ws.slackBotToken, client);
  }
  return { client, channel: ws.slackChannelId ?? "", teamMap: ws.teamMap };
}

/** Web client for other modules (listener); null when Slack isn't configured. */
export async function getSlackWeb(): Promise<WebClient | null> {
  return (await ctx()).client;
}

const slackError = (e: unknown) => String((e as { data?: { error?: string } })?.data?.error ?? (e as Error).message);

/**
 * Posting is best-effort and says what happened: the analysis behind the report is
 * worth keeping even when Slack won't take it. `not_in_channel` is the one failure
 * we can actually remedy ourselves — a public channel can be joined, so try that
 * once before giving up, and otherwise say exactly what the human must do.
 */
export async function postReport(text: string): Promise<string> {
  const { client, channel } = await ctx();
  if (!client || !channel) return "skipped (no slack config)";
  try {
    await client.chat.postMessage({ channel, text, unfurl_links: false });
    return `posted to ${channel}`;
  } catch (e) {
    if (slackError(e) !== "not_in_channel") return `report not posted (slack: ${slackError(e)})`;
    try {
      await client.conversations.join({ channel });
      await client.chat.postMessage({ channel, text, unfurl_links: false });
      return `posted to ${channel} (joined it first)`;
    } catch (joinErr) {
      return `report not posted — Cadence isn't in that channel and couldn't join it (${slackError(joinErr)}). Invite the bot with /invite @Cadence, or pick another channel in Settings.`;
    }
  }
}

/** Undo: delete recent messages Cadence's bot posted to the channel (keeps Slack demo-fresh). */
export async function deleteRecentBotMessages(): Promise<string> {
  const { client, channel } = await ctx();
  if (!client || !channel) return "skipped (no slack config)";
  const me = await client.auth.test();
  const hist = await client.conversations.history({ channel, limit: 50 });
  let n = 0;
  for (const m of hist.messages ?? [])
    if (m.user === me.user_id && m.ts) {
      await client.chat.delete({ channel, ts: m.ts }).catch(() => {});
      n++;
    }
  return `deleted ${n} bot message(s)`;
}

/** DM the mapped Slack user; unmapped → graceful channel mention (never dropped, PRODUCT_FLOWS §4). */
export async function notifyOwner(githubLogin: string, text: string): Promise<string> {
  const { client, channel, teamMap } = await ctx();
  if (!client) return "skipped (no slack config)";
  const slackId = teamMap[githubLogin];
  if (slackId) {
    // U/W = user id → open the DM; D = already a DM channel id → post directly
    const dmChannel = slackId.startsWith("D") ? slackId : (await client.conversations.open({ users: slackId })).channel!.id!;
    await client.chat.postMessage({ channel: dmChannel, text });
    return `dm → ${githubLogin}`;
  }
  if (channel) {
    await client.chat.postMessage({ channel, text: `(for **${githubLogin}** — not yet mapped to Slack)\n${text}` });
    return `channel mention → ${githubLogin} (unmapped)`;
  }
  return "skipped (no channel)";
}
