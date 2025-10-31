import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
const budget = 1200;
const Item = z.object({
  id: z.string().optional(),
  prompt: z.string().min(5),
  choices: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  category: z.string().min(1),
});

const BodySchema = z.union([
  z.object({ item: Item }),
  z.object({ items: z.array(Item).min(1) }),
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildVerdictSchema() {
  return {
    type: "json_schema" as const,
    name: "verdict",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["pass", "reason"],
      properties: {
        pass: { type: "boolean" },
        reason: { type: "string" },
        source_url: { type: "string" },
        fixed: {
          type: "object",
          additionalProperties: false,
          properties: {
            prompt: { type: "string" },
            choices: {
              type: "array",
              items: { type: "string" },
              minItems: 4,
              maxItems: 4,
            },
            answerIndex: { type: "integer", minimum: 0, maximum: 3 },
            explanation: { type: "string" },
            category: { type: "string" },
          },
        },
      },
    },
  };
}

function buildValidationPayloadWithEvidence(q: any, evidenceText: string) {
  const input =
    `以下のエビデンスの範囲で、クイズ項目を検証してください。事実性、日本語の自然さ、4択・重複/同義禁止、answerIndexとの整合性を確認し、問題がある場合は最小限の修正案を fixed に含めてください。推測は不可。\n` +
    `【クイズ】\n問題: ${q.prompt}\n選択肢: ${q.choices.join(
      ", "
    )}\n正解インデックス: ${q.answerIndex}\nカテゴリ: ${q.category ?? ""}\n` +
    `【エビデンス（Wikipedia要約）】\n${evidenceText}\n` +
    `出力はJSONのみ: {\"pass\": boolean, \"reason\": string, \"source_url\"?: string, \"fixed\"?: {\"prompt\"?: string, \"choices\"?: string[], \"answerIndex\"?: number, \"explanation\"?: string, \"category\"?: string}}`;
  return {
    model: "gpt-5-nano",
    input,
    max_output_tokens: budget,
    text: { verbosity: "low", format: buildVerdictSchema() },
  } as const;
}

function buildFallbackValidationPayload(q: any) {
  const input =
    `次のクイズ項目を検証してください。事実性、日本語の自然さ、4択・重複/同義禁止、answerIndexの整合性を確認し、問題がある場合は最小限の修正案を fixed に含めてください。\n` +
    `問題: ${q.prompt}\n` +
    `選択肢: ${q.choices.join(", ")}\n` +
    `正解インデックス: ${q.answerIndex}\n` +
    `カテゴリ: ${q.category}\n` +
    `出力はJSONのみ: {\"pass\": boolean, \"reason\": string, \"source_url\"?: string, \"fixed\"?: {\"prompt\"?: string, \"choices\"?: string[], \"answerIndex\"?: number, \"explanation\"?: string, \"category\"?: string}}`;
  return {
    model: "gpt-5-nano",
    input,
    max_output_tokens: budget,
    text: { verbosity: "low", format: buildVerdictSchema() },
  } as const;
}

async function verifyWithSources(q: any, apiKey: string) {
  async function fetchWikiEvidence(query: string, lang: string = "ja") {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=&format=json&srlimit=3&origin=*`;
      const sr = await fetch(searchUrl);
      const sj = await sr.json();
      const hits = sj?.query?.search ?? [];
      const texts: string[] = [];
      const urls: string[] = [];
      for (const h of hits.slice(0, 2)) {
        const title = h?.title;
        if (!title) continue;
        const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          title
        )}`;
        const rs = await fetch(sumUrl);
        if (!rs.ok) continue;
        const js = await rs.json();
        const extract = js?.extract || js?.description || "";
        const page =
          js?.content_urls?.desktop?.page ||
          js?.url ||
          `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
        if (extract) texts.push(extract);
        if (page) urls.push(page);
      }
      const text = texts.join("\n\n");
      return { text, urls };
    } catch {
      return { text: "", urls: [] };
    }
  }

  const ev = await fetchWikiEvidence(q.prompt);
  const urlV = "https://api.openai.com/v1/responses";
  if (ev.text && ev.text.length > 0) {
    const payloadV: any = buildValidationPayloadWithEvidence(q, ev.text);
    const r = await fetch(urlV, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payloadV),
    });
    try {
      const t = await r.text();
      const j = JSON.parse(t);
      const out = Array.isArray(j.output) ? j.output : [];
      for (const e of out) {
        const c = e?.content?.[0];
        if (c?.type === "json" && c.json) {
          if (!c.json.source_url && ev.urls?.length)
            c.json.source_url = ev.urls[0];
          return c.json;
        }
        if (c?.type === "output_text" && typeof c.text === "string") {
          try {
            const v = JSON.parse(c.text);
            if (!v.source_url && ev.urls?.length) v.source_url = ev.urls[0];
            return v;
          } catch {}
        }
      }
    } catch {}
  }

  // フォールバック: 自己検証
  const fallbackPayload: any = buildFallbackValidationPayload(q);
  const r = await fetch(urlV, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(fallbackPayload),
  });
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    const out = Array.isArray(j.output) ? j.output : [];
    for (const e of out) {
      const c = e?.content?.[0];
      if (c?.type === "json" && c.json) return c.json;
      if (c?.type === "output_text" && typeof c.text === "string") {
        try {
          return JSON.parse(c.text);
        } catch {}
      }
    }
  } catch {}
  return { pass: true, reason: "fallback" };
}

// 新方式: 問題文のみをGPTへ投げて回答語句を受け取り、
// その回答が選択肢に含まれていれば合格とする。
async function verifyByAnswer(q: any, apiKey: string) {
  const url = "https://api.openai.com/v1/responses";
  const payload: any = {
    model: "gpt-5-nano",
    input:
      `次の四択クイズの正解に該当する語句を1つだけ答えてください。` +
      `\n- 回答はできるだけ短く、選択肢と同じ語句で返してください。` +
      `\n- 解説や前後の文章、コードフェンスは禁止。` +
      `\n- 出力はJSONのみで、{\\"answer\\": string} の形で返してください。` +
      `\n\n問題: ${q.prompt}`,
    max_output_tokens: 200,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "answer",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["answer"],
          properties: { answer: { type: "string" } },
        },
      },
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    const out = Array.isArray(j.output) ? j.output : [];
    for (const e of out) {
      const c = e?.content?.[0];
      if (c?.type === "json" && c.json && typeof c.json.answer === "string") {
        const answer = c.json.answer as string;
        return matchAnswerToChoices(answer, q.choices, q.answerIndex);
      }
      if (c?.type === "output_text" && typeof c.text === "string") {
        try {
          const v = JSON.parse(c.text);
          if (typeof v?.answer === "string") return matchAnswerToChoices(v.answer, q.choices, q.answerIndex);
        } catch {}
      }
    }
  } catch {}
  return { pass: false, reason: "回答取得に失敗" };
}

function matchAnswerToChoices(answer: string, choices: string[], expectedIndex: number) {
  const norm = (s: string) =>
    (s || "")
      .trim()
      .replace(/[\u3000\s]+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/[．｡]/g, ".")
      .replace(/[，､]/g, ",")
      .replace(/[！]/g, "!")
      .replace(/[？]/g, "?")
      .toLowerCase()
      .replace(/[\s、,。\.]/g, "");
  const ans = norm(answer);
  const normChoices = choices.map((c) => norm(c));
  const hit = normChoices.findIndex((c) => c === ans);
  if (hit < 0) return { pass: false, reason: "選択肢に一致する回答なし" };
  if (Number.isInteger(expectedIndex) && hit === expectedIndex) {
    return { pass: true, reason: `一致インデックスOK (hit=${hit}, expected=${expectedIndex})` };
  }
  return { pass: false, reason: `一致はしたがインデックス不一致 (hit=${hit}, expected=${expectedIndex})` };
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  const provided = req.headers.get("x-admin-token");
  if (adminToken && provided !== adminToken)
    return json({ error: "Unauthorized" }, 401);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return json(
      { error: "Invalid request", details: (e as Error).message },
      400
    );
  }

  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Missing OpenAI API key" }, 500);

  const items = "item" in body ? [body.item] : body.items;
  function japaneseRatio(s: string) {
    const txt = (s || "").replace(/\s+/g, "");
    if (!txt) return 0;
    let ja = 0;
    for (const ch of txt) {
      const code = ch.codePointAt(0) || 0;
      if (
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0x4e00 && code <= 0x9faf) ||
        (code >= 0x3400 && code <= 0x4dbf)
      )
        ja++;
    }
    return ja / txt.length;
  }
  function hasProhibitedPhrases(s: string) {
    const t = (s || "").toLowerCase();
    return (
      t.includes("以上すべて") ||
      t.includes("上記すべて") ||
      t.includes("どれでもない") ||
      t.includes("none of the above") ||
      t.includes("all of the above")
    );
  }
  const results = [] as any[];
  for (const q of items) {
    try {
      // 静的チェック
      const jaPrompt = japaneseRatio(q.prompt) >= 0.3;
      const uniqueChoices = (() => {
        const seen = new Set<string>();
        for (const c of q.choices) {
          const k = (c || "").toLowerCase().replace(/[\s、,\.]/g, "");
          if (!k || seen.has(k)) return false;
          seen.add(k);
          if (hasProhibitedPhrases(c)) return false;
        }
        return true;
      })();
      if (!jaPrompt || !uniqueChoices) {
        results.push({
          id: q.id ?? null,
          pass: false,
          reason: !jaPrompt ? "日本語として不自然" : "選択肢に重複/不適切句",
        });
        continue;
      }
      const v = await verifyByAnswer(q, apiKey);
      results.push({ id: q.id ?? null, ...v });
    } catch (e) {
      results.push({ id: q.id ?? null, pass: false, reason: "検証エラー" });
    }
  }
  return json({ results }, 200);
}
