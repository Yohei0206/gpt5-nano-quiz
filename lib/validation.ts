export function normalizeJa(s: string) {
  return (s || "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[．｡]/g, ".")
    .replace(/[，､]/g, ",")
    .replace(/[！]/g, "!")
    .replace(/[？]/g, "?")
    // remove common surrounding quote/bracket chars
    .replace(/[「」『』【】]/g, "")
    // drop parenthetical content which often differs (e.g., 別名)
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "");
}

export function normalizeForChoiceCompare(s: string) {
  return normalizeJa(s)
    .toLowerCase()
    .replace(/[\s、,。\.・:：;；\-—_]/g, "");
}

export function matchAnswerToChoices(
  answer: string,
  choices: string[],
  expectedIndex?: number
): { pass: boolean; reason: string; hitIndex: number } {
  const ans = normalizeForChoiceCompare(answer);
  const normChoices = choices.map((c) => normalizeForChoiceCompare(c));
  const hit = normChoices.findIndex((c) => c === ans);
  if (hit < 0) return { pass: false, reason: "選択肢に一致する回答なし", hitIndex: -1 };
  if (typeof expectedIndex === "number" && expectedIndex >= 0) {
    if (hit === expectedIndex)
      return {
        pass: true,
        reason: `一致インデックスOK (hit=${hit}, expected=${expectedIndex})`,
        hitIndex: hit,
      };
    return {
      pass: false,
      reason: `一致はしたがインデックス不一致 (hit=${hit}, expected=${expectedIndex})`,
      hitIndex: hit,
    };
  }
  return { pass: true, reason: `GPT回答が選択肢と一致 (\"${choices[hit]}\")`, hitIndex: hit };
}
