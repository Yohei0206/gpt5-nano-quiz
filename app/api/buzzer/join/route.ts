import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const JoinSchema = z.object({
  matchId: z.string().uuid().optional(),
  joinCode: z.string().min(4).max(12).optional(),
  name: z.string().min(1).max(32),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function randToken(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof JoinSchema>;
  try {
    body = JoinSchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }

  const svc = serverSupabaseService();
  const token = randToken();

  // Resolve match id by join code if needed
  let matchId = body.matchId as string | undefined;
  if (!matchId && body.joinCode) {
    const { data: m, error: me } = await svc
      .from("matches")
      .select("id,state")
      .eq("join_code", body.joinCode)
      .single();
    if (me) return json({ error: me.message }, 404);
    if (m.state !== "waiting") return json({ error: "Match already started" }, 409);
    matchId = m.id as string;
  }
  if (!matchId) return json({ error: "matchId or joinCode required" }, 400);

  const { data: p, error: pe } = await svc
    .from("match_players")
    .insert({ match_id: matchId, name: body.name, token })
    .select("id")
    .single();
  if (pe) return json({ error: pe.message }, 500);

  await svc.from("match_events").insert({ match_id: matchId, type: "join", payload: { name: body.name } });

  return json({ matchId, playerId: p!.id as string, token }, 200);
}

