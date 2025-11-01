import type { Difficulty, Question } from "@/lib/types";

export interface GenerateQuestionsOptions {
  difficulty: Difficulty;
  count: number;
  language?: string;
  category?: string;
  title?: string;
}

function buildPayload(options: GenerateQuestionsOptions) {
  const payload: Record<string, unknown> = {
    difficulty: options.difficulty,
    count: options.count,
    language: options.language ?? "ja",
  };

  if (options.category) {
    payload.category = options.category;
  }

  const trimmedTitle = options.title?.trim();
  if (trimmedTitle) {
    payload.title = trimmedTitle;
  }

  return payload;
}

export async function generateQuestions(
  options: GenerateQuestionsOptions
): Promise<Question[]> {
  const response = await fetch("/api/generate-questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildPayload(options)),
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    const message = (data as any)?.error || `失敗しました (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      "問題が取得できませんでした。条件を変えて再試行してください。"
    );
  }

  return data as Question[];
}
