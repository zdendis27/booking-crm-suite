import { NextResponse, type NextRequest } from "next/server";
import OpenAI from "openai";
import { createSupabaseServer } from "@/lib/supabase/server";
import { clientsDueForReturn, detectIntent, explainRevenueChange, overview, runIntent, staffPerformance, topServices, worstDays, type AiBlock } from "@/lib/server/ai-tools";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const system = `Jsi analytický asistent pro majitele beauty salonu. Odpovídáš česky, stručně a věcně, na základě skutečných dat získaných přes nástroje.
Nikdy si nevymýšlej čísla. Pokud data chybí, řekni to. Doporuč konkrétní další krok (např. poslat kampaň, změnit nabídku, zapnout automatizaci).
Částky jsou v korunách. Neuváděj osobní údaje klientů kromě jmen, která nástroje vrátí.`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "explain_revenue_change", description: "Porovná tržby a příčiny změny tento měsíc oproti stejnému období minulého měsíce.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "top_services", description: "Služby seřazené podle tržeb za posledních N dní.", parameters: { type: "object", properties: { days: { type: "integer" } } } } },
  { type: "function", function: { name: "worst_days", description: "Obsazenost podle dne v týdnu a nejslabší dny.", parameters: { type: "object", properties: { days: { type: "integer" } } } } },
  { type: "function", function: { name: "clients_due_for_return", description: "Klienti, kteří překročili svou obvyklou dobu mezi návštěvami a měli by dostat pozvánku.", parameters: { type: "object", properties: { limit: { type: "integer" } } } } },
  { type: "function", function: { name: "staff_performance", description: "Výkon zaměstnanců (tržby, klienti, obsazenost).", parameters: { type: "object", properties: { days: { type: "integer" } } } } },
  { type: "function", function: { name: "month_overview", description: "Souhrn tohoto měsíce.", parameters: { type: "object", properties: {} } } },
];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { salonId?: string; messages?: Message[]; conversationId?: string } | null;
  if (!body?.salonId || !body.messages?.length) return NextResponse.json({ error: "Neplatný požadavek" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });

  const { data: membership } = await supabase.from("memberships").select("role").eq("salon_id", body.salonId).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "manager"].includes(membership.role)) return NextResponse.json({ error: "Nedostatečná oprávnění" }, { status: 403 });
  const { data: allowed } = await supabase.rpc("plan_has_feature", { p_salon: body.salonId, p_feature: "ai" });
  if (!allowed) return NextResponse.json({ error: "AI asistent není součástí tarifu" }, { status: 402 });

  const question = body.messages.at(-1)!.content.slice(0, 2000);
  let conversationId = body.conversationId;
  if (!conversationId) {
    const { data } = await supabase.from("ai_conversations").insert({ salon_id: body.salonId, user_id: user.id, title: question.slice(0, 80) }).select("id").single();
    conversationId = data?.id;
  }
  if (conversationId) await supabase.from("ai_messages").insert({ conversation_id: conversationId, salon_id: body.salonId, role: "user", content: question });

  const sb = supabase as never;
  let answer = "";
  let blocks: AiBlock[] = [];
  let mode: "openai" | "builtin" = "builtin";

  try {
    if (process.env.OPENAI_API_KEY) {
      mode = "openai";
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: system }, ...body.messages.slice(-10).map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam)];
      for (let step = 0; step < 5; step++) {
        const completion = await client.chat.completions.create({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", messages, tools, temperature: 0.3 });
        const message = completion.choices[0]!.message;
        messages.push(message);
        if (!message.tool_calls?.length) {
          answer = message.content ?? "";
          break;
        }
        for (const call of message.tool_calls) {
          if (call.type !== "function") continue;
          const args = JSON.parse(call.function.arguments || "{}") as { days?: number; limit?: number };
          let result: { text: string; data: unknown; block?: AiBlock };
          switch (call.function.name) {
            case "explain_revenue_change":
              result = await explainRevenueChange(sb, body.salonId);
              break;
            case "top_services":
              result = await topServices(sb, body.salonId, args.days ?? 30);
              break;
            case "worst_days":
              result = await worstDays(sb, body.salonId, args.days ?? 60);
              break;
            case "clients_due_for_return":
              result = await clientsDueForReturn(sb, body.salonId, args.limit ?? 12);
              break;
            case "staff_performance":
              result = await staffPerformance(sb, body.salonId, args.days ?? 30);
              break;
            default:
              result = await overview(sb, body.salonId);
          }
          if (result.block) blocks.push(result.block);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ summary: result.text, data: result.data }).slice(0, 12000) });
        }
      }
      if (!answer) answer = "Nepodařilo se mi sestavit odpověď, zkuste otázku přeformulovat.";
    } else {
      const result = await runIntent(sb, body.salonId, detectIntent(question));
      answer = result.text;
      if (result.block) blocks = [result.block];
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (conversationId) await supabase.from("ai_messages").insert({ conversation_id: conversationId, salon_id: body.salonId, role: "assistant", content: answer, tool_calls: blocks as never });
  return NextResponse.json({ answer, blocks, conversationId, mode });
}
