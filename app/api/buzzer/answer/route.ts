import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const AnswerSchema = z.object({
  matchId: z.string().uuid(),
  token: z.string().min(8),
  answerIndex: z.number().int().min(0).max(3),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof AnswerSchema>;
  try {
    body = AnswerSchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }
  const svc = serverSupabaseService();

  // Verify player and lock
  const { data: player, error: pe } = await svc
    .from("match_players")
    .select("id,match_id")
    .eq("match_id", body.matchId)
    .eq("token", body.token)
    .single();
  if (pe) return json({ error: pe.message }, 401);

  const { data: m, error: me } = await svc
    .from("matches")
    .select("state,current_index,locked_by,question_count")
    .eq("id", body.matchId)
    .single();
  if (me) return json({ error: me.message }, 404);
  if (m.state !== "in_progress") return json({ error: "Not in progress" }, 409);
  // New: If no one has buzzed yet, treat first answer as buzz (attempt to acquire lock)
  if (!m.locked_by) {
    const { data: lockTry, error: le } = await svc
      .from("matches")
      .update({ locked_by: player.id, buzzed_at: new Date().toISOString() })
      .eq("id", body.matchId)
      .is("locked_by", null)
      .select("id,locked_by")
      .maybeSingle();
    // If update didn't affect (someone else locked first), re-read
    const { data: m2 } = await svc
      .from("matches")
      .select("locked_by")
      .eq("id", body.matchId)
      .single();
    if (m2 && m2.locked_by !== player.id) {
      return json({ error: "Not your turn" }, 403);
    }
  } else if (m.locked_by !== player.id) {
    return json({ error: "Not your turn" }, 403);
  }

  // Get current question
  const { data: qref, error: qe } = await svc
    .from("match_questions")
    .select("question_id,order_no")
    .eq("match_id", body.matchId)
    .eq("order_no", m.current_index)
    .single();
  if (qe) return json({ error: qe.message }, 500);
  const { data: q, error: qerr } = await svc
    .from("questions")
    .select("id,answer_index")
    .eq("id", qref.question_id)
    .single();
  if (qerr) return json({ error: qerr.message }, 500);

  const correct = Number(q.answer_index) === body.answerIndex;
  if (correct) {
    await svc
      .from("match_players")
      .update({ score: (await (async () => {
        // read current score quickly
        const { data: cur } = await svc.from("match_players").select("score").eq("id", player.id).single();
        return (cur?.score ?? 0) + 1;
      })()) })
      .eq("id", player.id);
  }

  await svc.from("match_events").insert({
    match_id: body.matchId,
    type: "answer",
    payload: { player_id: player.id, correct, answerIndex: body.answerIndex, index: m.current_index },
  });

  // Advance or finish
  const nextIndex = m.current_index + 1;
  if (nextIndex >= m.question_count) {
    await svc.from("matches").update({ state: "finished", locked_by: null, buzzed_at: null }).eq("id", body.matchId);
    await svc.from("match_events").insert({ match_id: body.matchId, type: "finish", payload: {} });
    return json({ correct, finished: true }, 200);
  } else {
    await svc
      .from("matches")
      .update({ current_index: nextIndex, locked_by: null, buzzed_at: null })
      .eq("id", body.matchId);
    // emit next question summary
    const { data: qref2 } = await svc
      .from("match_questions")
      .select("question_id,order_no")
      .eq("match_id", body.matchId)
      .eq("order_no", nextIndex)
      .single();
    const { data: q2 } = await svc
      .from("questions")
      .select("id,prompt,choices")
      .eq("id", qref2!.question_id)
      .single();
    await svc.from("match_events").insert({
      match_id: body.matchId,
      type: "question",
      payload: { index: nextIndex, id: q2!.id, prompt: q2!.prompt, choices: q2!.choices },
    });
    return json({ correct, finished: false, nextIndex }, 200);
  }
}
