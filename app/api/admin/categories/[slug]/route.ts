import { NextRequest } from "next/server";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function DELETE(req: NextRequest, context: { params: { slug: string } }) {
  const adminToken = process.env.ADMIN_TOKEN;
  const header = req.headers.get("x-admin-token");
  if (adminToken && header !== adminToken) return json({ error: "Unauthorized" }, 401);

  const slug = decodeURIComponent(context.params.slug || "").trim();
  if (!slug) return json({ error: "Missing slug" }, 400);

  const url = new URL(req.url);
  const moveTo = (url.searchParams.get("moveTo") || "").trim();
  const cascade = url.searchParams.get("cascade") === "1";

  const supabase = serverSupabaseService();

  // Count referencing questions
  const { count, error: cntErr } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("category", slug);
  if (cntErr) return json({ error: cntErr.message }, 500);

  // If there are referencing rows and no moveTo/cascade, block with guidance
  if ((count || 0) > 0 && !moveTo && !cascade) {
    return json(
      {
        error:
          "カテゴリを参照している問題があります。moveTo=新スラッグ を指定して移動するか、cascade=1 で問題ごと削除してください。",
        referencing: count,
      },
      409
    );
  }

  // Optional: validate destination category exists when moveTo is specified
  if (moveTo) {
    const { data: dest, error: destErr } = await supabase
      .from("categories")
      .select("slug")
      .eq("slug", moveTo)
      .single();
    if (destErr || !dest) return json({ error: "移動先カテゴリが見つかりません" }, 400);
  }

  // Move or delete referencing questions
  let moved = 0;
  let deletedQuestions = 0;
  if ((count || 0) > 0) {
    if (moveTo) {
      const { error: upErr } = await supabase
        .from("questions")
        .update({ category: moveTo })
        .eq("category", slug);
      if (upErr) return json({ error: upErr.message }, 500);
      moved = count || 0;
    } else if (cascade) {
      const { data: delIds, error: selErr } = await supabase
        .from("questions")
        .select("id")
        .eq("category", slug);
      if (selErr) return json({ error: selErr.message }, 500);
      const ids = (delIds || []).map((r: any) => r.id);
      if (ids.length) {
        const { error: delErr } = await supabase.from("questions").delete().in("id", ids);
        if (delErr) return json({ error: delErr.message }, 500);
        deletedQuestions = ids.length;
      }
    }
  }

  // Finally delete the category
  const { error: delCatErr } = await supabase.from("categories").delete().eq("slug", slug);
  if (delCatErr) return json({ error: delCatErr.message }, 500);

  return json({ ok: true, removed: slug, moved, deletedQuestions }, 200);
}

