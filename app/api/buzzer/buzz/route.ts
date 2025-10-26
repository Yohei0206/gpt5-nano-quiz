import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const BuzzSchema = z.object({
  matchId: z.string().uuid(),
  token: z.string().min(8),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BuzzSchema>;
  try {
    body = BuzzSchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }
  const svc = serverSupabaseService();

  const { data: player, error: pe } = await svc
    .from("match_players")
    .select("id,match_id")
    .eq("match_id", body.matchId)
    .eq("token", body.token)
    .single();
  if (pe) return json({ error: pe.message }, 401);

  const { data: m, error: me } = await svc
    .from("matches")
    .select("state,locked_by")
    .eq("id", body.matchId)
    .single();
  if (me) return json({ error: me.message }, 404);
  if (m.state !== "in_progress") return json({ error: "Not accepting buzz" }, 409);
  if (m.locked_by) return json({ error: "Locked by another" }, 409);

  const { error: ue } = await svc
    .from("matches")
    .update({ locked_by: player.id, buzzed_at: new Date().toISOString() })
    .eq("id", body.matchId);
  if (ue) return json({ error: ue.message }, 500);

  await svc.from("match_events").insert({ match_id: body.matchId, type: "buzz", payload: { player_id: player.id } });
  return json({ ok: true }, 200);
}

