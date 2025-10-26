import { NextRequest } from "next/server";
import { serverSupabaseAnon } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(_req: NextRequest) {
  const supabase = serverSupabaseAnon();
  const { data, error } = await supabase
    .from("difficulties")
    .select("key,label,order_no,created_at")
    .order("order_no", { ascending: true });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ items: data ?? [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

