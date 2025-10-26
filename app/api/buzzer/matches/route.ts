import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService, serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "nodejs";

const CreateSchema = z.object({
  category: z.string().min(1),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  questionCount: z.number().int().min(1).max(20).default(8),
  hostName: z.string().min(1).max(32),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function randCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function randToken(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }

  // Initialize Supabase clients with clearer error on missing env
  let svc;
  let anon;
  try {
    svc = serverSupabaseService();
    anon = serverSupabaseAnon();
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    return json(
      {
        error:
          "Failed to initialize Supabase client. Check SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.",
        details: msg,
      },
      500
    );
  }

  // Quick sanity: ensure buzzer tables exist to avoid opaque 500s
  const chk = await svc.from("matches").select("id").limit(1).maybeSingle();
  if (chk.error && /relation .*matches.* does not exist/i.test(chk.error.message || "")) {
    return json({ error: "Buzzer schema not applied. Please run supabase/buzzer.sql." }, 500);
  }

  // Ensure questions table exists as well (used to pick questions)
  const chkQ = await anon.from("questions").select("id").limit(1).maybeSingle();
  if (chkQ.error && /relation .*questions.* does not exist/i.test(chkQ.error.message || "")) {
    return json({ error: "Questions schema not applied. Please run supabase/schema.sql." }, 500);
  }

  // Pick questions matching category/difficulty
  const { data: q1, error: e1 } = await anon
    .from("questions")
    .select("id")
    .eq("category", body.category)
    .eq("difficulty", body.difficulty)
    .limit(200);
  if (e1) return json({ error: e1.message }, 500);
  const pool = (q1 ?? []).map((r: any) => r.id);
  if (!pool.length) return json({ error: "No questions for given settings" }, 404);
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const selected = pool.slice(0, body.questionCount);

  const joinCode = randCode();
  const hostToken = randToken();

  const { data: mData, error: mErr } = await svc
    .from("matches")
    .insert({
      join_code: joinCode,
      category: body.category,
      difficulty: body.difficulty,
      question_count: body.questionCount,
      state: "waiting",
    })
    .select("id")
    .single();
  if (mErr) return json({ error: mErr.message }, 500);
  const matchId = mData!.id as string;

  // Insert host player
  const { data: pData, error: pErr } = await svc
    .from("match_players")
    .insert({ match_id: matchId, name: body.hostName, token: hostToken, is_host: true })
    .select("id")
    .single();
  if (pErr) return json({ error: pErr.message }, 500);

  // Insert questions
  const mqRows = selected.map((qid, i) => ({ match_id: matchId, question_id: qid, order_no: i }));
  const { error: mqErr } = await svc.from("match_questions").insert(mqRows);
  if (mqErr) return json({ error: mqErr.message }, 500);

  // Seed event
  await svc.from("match_events").insert({ match_id: matchId, type: "created", payload: { join_code: joinCode } });

  return json({ matchId, joinCode, hostToken, hostPlayerId: pData!.id as string }, 200);
}
