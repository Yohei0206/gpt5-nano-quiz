import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

const BodySchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/i, "英数字とハイフンのみ"),
  label: z.string().min(1).max(100),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (adminToken && header !== adminToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json({ error: "Invalid request", details: (e as Error).message }, 400);
  }

  const supabase = serverSupabaseService();

  const { data, error } = await supabase
    .from("categories")
    .insert({ slug: body.slug, label: body.label })
    .select("slug,label,created_at")
    .single();

  if (error) {
    // On conflict returns error code, adjust if needed
    return json({ error: error.message }, 500);
  }

  return json({ item: data }, 200);
}

