import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, RotateCcw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogoMark } from "@/components/Logo";
import { ModelPicker } from "@/components/ModelPicker";
import { api, type ConvoMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Why are we slipping?", "Who is the bottleneck right now?", "What single action would help most?"];

/**
 * The agent replies in light markdown. Rendering just bold, `code` and bullets keeps
 * "**25%**" from showing up literally, without pulling in a markdown dependency.
 */
function RichText({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-medium text-foreground">{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-background px-1 py-0.5 font-mono text-[12px]">{part.slice(1, -1)}</code>;
      return part;
    });

  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[*-]\s+(.*)$/);
        if (bullet)
          return (
            <span key={i} className="flex gap-2">
              <span className="select-none text-ink-faint">•</span>
              <span>{inline(bullet[1] ?? "")}</span>
            </span>
          );
        if (!line.trim()) return <span key={i} className="block h-2" />;
        return <span key={i} className="block">{inline(line)}</span>;
      })}
    </>
  );
}

/** Cadence speaks as the mark; the human gets a neutral avatar. */
function Speaker({ role }: { role: ConvoMessage["role"] }) {
  return role === "assistant" ? (
    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card" title="Cadence">
      <LogoMark className="size-4" />
    </span>
  ) : (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground" title="You">
      <User className="size-3.5" aria-hidden />
    </span>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chat().then(setMessages).catch(() => {});
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, thinking]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: t, ts: new Date().toISOString() }]);
    setThinking(true);
    try {
      const { reply, proposedAction } = await api.chatSend(t);
      setMessages((m) => [...m, { role: "assistant", text: reply, ts: new Date().toISOString(), proposedAction }]);
    } catch (e) {
      const detail = (e as Error).message;
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `I hit an error answering that — ${detail.replace(/\.$/, "")}. Try me again.`, ts: new Date().toISOString() },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const confirm = async () => {
    setThinking(true);
    try {
      await api.chatConfirm();
      setMessages(await api.chat()); // server state marks the proposal executed
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `I couldn't apply that — ${(e as Error).message}`, ts: new Date().toISOString() }]);
    } finally {
      setThinking(false);
    }
  };

  /** The conversation is one rolling thread per workspace, so "new" means clearing it. */
  const clearChat = async () => {
    const previous = messages;
    setMessages([]); // optimistic — starting over should feel instant
    try {
      await api.chatClear();
    } catch {
      setMessages(previous);
    }
  };

  const lastProposalIdx = messages.findLastIndex((m) => m.proposedAction && !m.executed);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold leading-[26px]">Chat</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ask about the sprint — answers cite real items. Same agent as @Cadence in Slack.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModelPicker disabled={thinking} />
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat} disabled={thinking} aria-label="Start a new conversation">
              <RotateCcw className="size-3.5" aria-hidden />
              New chat
            </Button>
          )}
        </div>
      </header>

      <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1" role="log" aria-label="Conversation" aria-busy={thinking}>
        {messages.length === 0 && !thinking && (
          <div className="mt-10 text-center">
            <LogoMark className="mx-auto size-6 opacity-70" />
            <p className="mt-3 text-sm text-muted-foreground">Start with one of these:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("msg-in flex max-w-[78ch] gap-2.5", m.role === "user" && "ml-auto flex-row-reverse")}>
            <Speaker role={m.role} />
            <div className="min-w-0">
              <div
                className={cn(
                  "flex flex-col rounded-lg px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "whitespace-pre-wrap bg-secondary" : "border border-border bg-card",
                )}
              >
                {m.role === "assistant" ? <RichText text={m.text} /> : m.text}
              </div>
              {m.proposedAction && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-card px-4 py-2.5">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Proposed: </span>
                    <span className="font-medium">
                      {m.proposedAction.kind}{" "}
                      <span className="font-mono">
                        {m.proposedAction.kind === "dm" ? `@${m.proposedAction.githubLogin}` : `#${m.proposedAction.itemNumber}`}
                      </span>
                    </span>
                  </p>
                  {i === lastProposalIdx ? (
                    <Button size="sm" onClick={confirm} disabled={thinking}>
                      <Check className="size-3.5" aria-hidden />
                      Do it
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {m.executed && <Check className="size-3.5 text-rag-green" aria-hidden />}
                      {m.executed ? "applied" : "superseded"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="msg-in flex max-w-[78ch] gap-2.5">
            <Speaker role="assistant" />
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
              <span className="beat flex gap-1" aria-hidden>
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-sm text-primary">checking the sprint…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about delivery risk…"
          rows={2}
          className="resize-none"
          aria-label="Message Cadence"
        />
        <Button type="submit" disabled={thinking || !input.trim()} aria-label="Send">
          <CornerDownLeft className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
