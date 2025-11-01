import { NextRequest } from "next/server";
import { z } from "zod";
import { serverSupabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const QuestionSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(1),
  answerIndex: z.number().int().min(0).optional(),
  explanation: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});

const BodySchema = z.object({
  mode: z.enum(["single", "versus"]),
  question: QuestionSchema,
  context: z
    .object({
      questionIndex: z.number().int().min(0).optional(),
      userAnswer: z.number().int().min(0).optional(),
      correctAnswer: z.number().int().min(0).optional(),
      correct: z.boolean().optional(),
      matchId: z.string().optional(),
      playerId: z.string().optional(),
      note: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "Invalid request", details: (e as Error).message },
      400
    );
  }

  const supabase = serverSupabaseService();
  const q = parsed.question;
  const payload = {
    question_id:
      typeof q.id === "number" ? String(q.id) : q.id ? String(q.id) : null,
    prompt: q.prompt,
    choices: q.choices,
    answer_index:
      typeof q.answerIndex === "number" ? q.answerIndex : null,
    explanation: q.explanation ?? null,
    category: q.category ?? null,
    mode: parsed.mode,
    context: parsed.context ?? null,
  };
  const { error } = await supabase.from("question_reports").insert(payload);
  if (error) {
    return json({ error: error.message }, 500);
  }
  return json({ ok: true });
}

