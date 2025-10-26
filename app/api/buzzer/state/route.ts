import { NextRequest } from "next/server";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  if (!matchId) return json({ error: "matchId required" }, 400);
  const svc = serverSupabaseService();

  const { data: m, error: me } = await svc
    .from("matches")
    .select("id,join_code,state,category,difficulty,question_count,current_index,locked_by,buzzed_at")
    .eq("id", matchId)
    .single();
  if (me) return json({ error: me.message }, 404);

  const { data: players } = await svc
    .from("match_players")
    .select("id,name,score,is_host")
    .eq("match_id", matchId)
    .order("joined_at", { ascending: true });

  // current question without correct index
  let question: any = null;
  if (m.state !== "waiting") {
    const { data: qref } = await svc
      .from("match_questions")
      .select("question_id,order_no")
      .eq("match_id", matchId)
      .eq("order_no", m.current_index)
      .single();
    if (qref) {
      const { data: q } = await svc
        .from("questions")
        .select("id,prompt,choices")
        .eq("id", qref.question_id)
        .single();
      if (q) question = q;
    }
  }

  // latest answer event (to allow global feedback)
  let lastAnswer: any = null;
  try {
    const { data: evt } = await svc
      .from("match_events")
      .select("type,payload,created_at")
      .eq("match_id", matchId)
      .eq("type", "answer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evt) {
      lastAnswer = { ...evt.payload, created_at: evt.created_at };
    }
  } catch {}

  return json({
    match: m,
    players: players ?? [],
    question,
    lastAnswer,
  });
}
