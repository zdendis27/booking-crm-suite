"use client";

import { Avatar, Badge, Button, LogoMark, cn, useToast } from "@repo/ui";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Bot, CalendarRange, LineChart, RotateCcw, Sparkles, TrendingDown, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { useSalon } from "@/components/app/salon-context";

interface Block {
  type: "table" | "stats";
  title: string;
  columns?: string[];
  rows?: (string | number)[][];
  stats?: { label: string; value: string; tone?: "good" | "bad" | "neutral" }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  blocks?: Block[];
}

const suggestions = [
  { icon: TrendingDown, text: "Proč mi tento měsíc klesly tržby?" },
  { icon: Users, text: "Kteří zákazníci pravděpodobně brzy přijdou znovu?" },
  { icon: Trophy, text: "Která služba mi vydělává nejvíc?" },
  { icon: CalendarRange, text: "Které dny mám nejhorší obsazenost?" },
  { icon: Sparkles, text: "Komu mám poslat připomínku?" },
  { icon: LineChart, text: "Jak si vedou jednotliví pracovníci?" },
];

export function AssistantPage() {
  return (
    <FeatureGate feature="ai">
      <AssistantContent />
    </FeatureGate>
  );
}

function AssistantContent() {
  const { salon, userName } = useSalon();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState<string | undefined>();
  const [mode, setMode] = useState<"openai" | "builtin" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salonId: salon.id, messages: next.map((m) => ({ role: m.role, content: m.content })), conversationId: conversation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Asistent neodpověděl");
      setConversation(data.conversationId);
      setMode(data.mode);
      setMessages([...next, { role: "assistant", content: data.answer, blocks: data.blocks }]);
    } catch (error) {
      toast.error("Asistent neodpověděl", (error as Error).message);
      setMessages(next.slice(0, -1));
      setInput(question);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-4xl flex-col lg:h-[calc(100dvh-7rem)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white shadow-glow">
            <Bot className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI asistent</h1>
            <p className="text-sm text-fg-muted">Odpovídá nad skutečnými daty vašeho salonu</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode && <Badge tone={mode === "openai" ? "accent" : "neutral"}>{mode === "openai" ? "OpenAI" : "Vestavěná analýza"}</Badge>}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setConversation(undefined); }} leading={<RotateCcw className="h-4 w-4" />}>
              Nová konverzace
            </Button>
          )}
        </div>
      </div>

      <div className="ui-scroll flex-1 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xs sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 16 }} className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[image:var(--gradient-brand)] text-white shadow-glow">
              <Sparkles className="h-8 w-8" />
            </motion.div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Ahoj{userName ? `, ${userName.split(" ")[0]}` : ""}, na co se chcete zeptat?</h2>
            <p className="mt-2 max-w-md text-fg-muted">Analyzuji tržby, obsazenost, služby i chování klientů. Vyberte otázku nebo napište vlastní.</p>
            <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
              {suggestions.map((s, index) => (
                <motion.button
                  key={s.text}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.06 }}
                  onClick={() => ask(s.text)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 text-left text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent-soft/40 hover:shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <s.icon className="h-[18px] w-[18px]" />
                  </span>
                  {s.text}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-3", message.role === "user" && "flex-row-reverse")}>
                  {message.role === "assistant" ? <LogoMark size={34} /> : <Avatar name={userName || "Já"} size={34} />}
                  <div className={cn("max-w-[88%] space-y-3", message.role === "user" && "items-end")}>
                    <div className={cn("whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed", message.role === "user" ? "rounded-tr-sm bg-[image:var(--gradient-brand)] text-white" : "rounded-tl-sm bg-surface-2")}>{message.content}</div>
                    {message.blocks?.map((block, i) => <BlockView key={i} block={block} />)}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <LogoMark size={34} />
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-4">
                    {[0, 1, 2].map((i) => (
                      <motion.span key={i} className="h-2 w-2 rounded-full bg-accent" animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        className="mt-4 flex items-end gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--ring)]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Zeptejte se na cokoliv o svém salonu…"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-fg-subtle"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || busy} aria-label="Odeslat">
          <ArrowUp className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "stats") {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{block.title}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.stats?.map((stat) => (
            <div key={stat.label}>
              <p className="text-xs text-fg-subtle">{stat.label}</p>
              <p className={cn("text-lg font-semibold tabular", stat.tone === "good" && "text-success", stat.tone === "bad" && "text-danger")}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <p className="border-b border-border bg-surface-2/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{block.title}</p>
      <div className="ui-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              {block.columns?.map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows?.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {row.map((cell, j) => (
                  <td key={j} className={cn("px-4 py-2.5", j === 0 && "font-medium")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
