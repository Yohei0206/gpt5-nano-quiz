import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const BodySchema = z.object({
  questionId: z.union([z.string(), z.number()]).optional(),
  reportIds: z.array(z.union([z.string(), z.number()])).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const provided = req.headers.get("x-admin-token");
    if (provided !== adminToken) return json({ error: "Unauthorized" }, 401);
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "Invalid request", details: (e as Error).message },
      400
    );
  }

  const { questionId, reportIds } = parsed;
  if (!questionId && (!reportIds || reportIds.length === 0)) {
    return json(
      { error: "questionId or reportIds must be provided" },
      400
    );
  }

  const supabase = serverSupabaseService();

  let query = supabase.from("question_reports").delete();
  if (questionId) {
    query = query.eq("question_id", String(questionId));
  }
  if (reportIds && reportIds.length) {
    const ids = reportIds.map((id) =>
      typeof id === "number" ? id : Number(id)
    ).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return json({ error: "Invalid reportIds" }, 400);
    }
    query = query.in("id", ids);
  }

  const { data, error } = await query.select("id");
  if (error) return json({ error: error.message }, 500);

  const count = Array.isArray(data) ? data.length : 0;
  return json({ deleted: count });
}
