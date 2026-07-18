/**
 * Slack surface (DECISIONS §6, §13): report to the channel, DMs to mapped owners.
 * Identity map: TEAM_MAP env JSON ({"githubLogin":"U012345"}) until the wizard
 * populates Redis. No Slack env → warn-and-skip so the pipeline never crashes.
 */
import { WebClient } from "@slack/web-api";

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_CHANNEL_ID ?? "";
const client = token ? new WebClient(token) : null;
if (!client) console.warn("⚠ SLACK_BOT_TOKEN missing — Slack posts will be skipped.");
/** Shared Web client for other modules (listener); null when Slack isn't configured. */
export const slackWeb = client;

const teamMap: Record<string, string> = JSON.parse(process.env.TEAM_MAP ?? "{}");

export async function postReport(text: string): Promise<string> {
  if (!client || !channel) return "skipped (no slack config)";
  await client.chat.postMessage({ channel, text, unfurl_links: false });
  return `posted to ${channel}`;
}

/** Undo: delete recent messages Cadence's bot posted to the channel (keeps Slack demo-fresh). */
export async function deleteRecentBotMessages(): Promise<string> {
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
  if (!client) return "skipped (no slack config)";
  const slackId = teamMap[githubLogin];
  if (slackId) {
    // U/W = user id → open the DM; D = already a DM channel id → post directly
    const dmChannel = slackId.startsWith("D")
      ? slackId
      : (await client.conversations.open({ users: slackId })).channel!.id!;
    await client.chat.postMessage({ channel: dmChannel, text });
    return `dm → ${githubLogin}`;
  }
  if (channel) {
    await client.chat.postMessage({ channel, text: `(for **${githubLogin}** — not yet mapped to Slack)\n${text}` });
    return `channel mention → ${githubLogin} (unmapped)`;
  }
  return "skipped (no channel)";
}
