import type { GenerateParams } from "./types";

export function buildSystemPrompt() {
  return [
    "あなたは教育的で安全なクイズ作成アシスタントです。",
    "- 出力はJSON配列のみ。前後に説明や余計な文字・コードフェンスを含めない。",
    "- 4択式（choicesは常に4つ）。",
    "- idは一意な短い文字列。",
    "- explanationは任意（200文字以内）。",
    "- 不適切/差別的/医療・法律助言は避ける。",
  ].join("\n");
}

export function buildUserPrompt(params: GenerateParams) {
  const lang = params.language ?? "ja";
  const header = lang === "ja" ? "次の条件でクイズを生成してください" : "Generate multiple-choice quiz questions with these constraints";
  return [
    header + ":",
    `ジャンル/Category: ${params.category}`,
    `難易度/Difficulty: ${params.difficulty}`,
    `言語/Language: ${lang}`,
    `出題数/Count: ${Math.max(1, Math.min(10, params.count))}`,
    "必ず Count と同じ件数の要素を持つ JSON 配列のみを返してください。空配列は禁止。",
    "各要素は {id,prompt,choices(4),answerIndex,explanation?,category,difficulty,source} を満たすこと。",
    "choices は重複しない4つの妥当な候補にすること。category と difficulty は指定に一致させること。",
    "出力はJSON配列のみ（前後の説明文・コードフェンスは禁止）。",
  ].join("\n");
}
