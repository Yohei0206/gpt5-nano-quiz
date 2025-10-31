import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const BodySchema = z.object({
  category: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  const provided = req.headers.get("x-admin-token");
  if (adminToken && provided !== adminToken) return json({ error: "Unauthorized" }, 401);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }

  const supabase = serverSupabaseService();
  let q = supabase
    .from("questions")
    .select("id,choices,answer_index,category")
    .order("created_at", { ascending: false })
    .limit(body.limit);
  if (body.category && body.category.trim()) q = q.eq("category", body.category.trim());
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return json({ updated: 0, distribution: [0, 0, 0, 0] });

  const updates: { id: number; choices: string[]; answer_index: number }[] = [];
  const distribution = [0, 0, 0, 0];
  for (let i = 0; i < rows.length; i++) {
    const r: any = rows[i];
    const choices: string[] = (r.choices || []) as string[];
    if (!Array.isArray(choices) || choices.length !== 4) continue;
    const currentIdx: number = Number(r.answer_index ?? 0);
    const targetIdx = i % 4; // 単純に 0,1,2,3 を循環させる
    const newChoices = [...choices];
    if (currentIdx !== targetIdx) {
      const tmp = newChoices[targetIdx];
      newChoices[targetIdx] = newChoices[currentIdx];
      newChoices[currentIdx] = tmp;
    }
    updates.push({ id: Number(r.id), choices: newChoices, answer_index: targetIdx });
    distribution[targetIdx] += 1;
  }

  if (updates.length === 0) return json({ updated: 0, distribution });

  const { error: uerr } = await supabase.from("questions").upsert(updates);
  if (uerr) return json({ error: uerr.message }, 500);
  return json({ updated: updates.length, distribution });
}

