import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const StartSchema = z.object({
  matchId: z.string().uuid(),
  token: z.string().min(8), // host token
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof StartSchema>;
  try {
    body = StartSchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }
  const svc = serverSupabaseService();

  const { data: host, error: he } = await svc
    .from("match_players")
    .select("id,is_host,match_id")
    .eq("match_id", body.matchId)
    .eq("token", body.token)
    .single();
  if (he) return json({ error: he.message }, 401);
  if (!host.is_host) return json({ error: "Only host can start" }, 403);

  const { data: match, error: me } = await svc.from("matches").select("state").eq("id", body.matchId).single();
  if (me) return json({ error: me.message }, 404);
  if (match.state !== "waiting") return json({ error: "Already started" }, 409);

  // set in_progress and reset locks
  const { error: ue } = await svc
    .from("matches")
    .update({ state: "in_progress", current_index: 0, locked_by: null, buzzed_at: null })
    .eq("id", body.matchId);
  if (ue) return json({ error: ue.message }, 500);

  // Emit first question event
  const { data: qref, error: qe } = await svc
    .from("match_questions")
    .select("question_id,order_no")
    .eq("match_id", body.matchId)
    .order("order_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (qe) return json({ error: qe.message }, 500);
  if (!qref) return json({ error: "No questions" }, 400);

  const { data: q, error: qerr } = await svc
    .from("questions")
    .select("id,prompt,choices,answer_index")
    .eq("id", qref.question_id)
    .single();
  if (qerr) return json({ error: qerr.message }, 500);

  await svc.from("match_events").insert({
    match_id: body.matchId,
    type: "question",
    payload: { index: 0, id: q.id, prompt: q.prompt, choices: q.choices }, // do not include correct index
  });

  return json({ ok: true }, 200);
}

