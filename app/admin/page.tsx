"use client";
import { useMemo, useState } from "react";
import { z } from "zod";
import type { Difficulty, Question } from "@/lib/types";

// 固定カテゴリ + サブジャンル
const categories: {
  slug: string;
  label: string;
  subgenres: { slug: string; label: string }[];
}[] = [
  {
    slug: "general",
    label: "一般教養",
    subgenres: [
      { slug: "history", label: "歴史" },
      { slug: "geography", label: "地理" },
      { slug: "literature", label: "文学" },
    ],
  },
  {
    slug: "science",
    label: "理系・科学",
    subgenres: [
      { slug: "math", label: "数学" },
      { slug: "chemistry", label: "化学" },
      { slug: "biology", label: "生物" },
      { slug: "astronomy", label: "天文" },
    ],
  },
  {
    slug: "entertainment",
    label: "文化・エンタメ",
    subgenres: [
      { slug: "anime", label: "アニメ" },
      { slug: "movie", label: "映画" },
      { slug: "game", label: "ゲーム" },
      { slug: "music", label: "音楽" },
    ],
  },
  {
    slug: "otaku",
    label: "アニメ・ゲーム・漫画",
    subgenres: [
      { slug: "anime", label: "アニメ" },
      { slug: "game", label: "ゲーム" },
      { slug: "manga", label: "漫画" },
    ],
  },
  {
    slug: "trivia",
    label: "雑学",
    subgenres: [
      { slug: "food", label: "食" },
      { slug: "vehicle", label: "乗り物" },
      { slug: "business", label: "企業" },
      { slug: "animal", label: "動物" },
      { slug: "daily", label: "日常知識" },
    ],
  },
  {
    slug: "japan",
    label: "日本",
    subgenres: [
      { slug: "japanese-history", label: "日本史" },
      { slug: "culture", label: "文化" },
      { slug: "dialect", label: "方言" },
      { slug: "tourism", label: "観光地" },
    ],
  },
  {
    slug: "world",
    label: "世界",
    subgenres: [
      { slug: "world-history", label: "世界史" },
      { slug: "world-geography", label: "世界地理" },
      { slug: "flags", label: "国旗" },
      { slug: "culture", label: "文化" },
    ],
  },
  {
    slug: "society",
    label: "時事・社会",
    subgenres: [
      { slug: "politics", label: "政治" },
      { slug: "economy", label: "経済" },
      { slug: "it", label: "ITニュース" },
    ],
  },
];

const QuestionSchema = z.object({
  id: z.string(),
  prompt: z.string().min(5).max(200),
  choices: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(300).optional().or(z.literal("")),
  category: z.string().min(1),
  subgenre: z.string().optional().or(z.literal("")),
  difficulty: z.enum(["easy", "normal", "hard"]),
  source: z.string().min(1),
});

function genId() {
  return (
    "q_" +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

export default function AdminPage() {
  const [category, setCategory] = useState(categories[0].slug);
  const subs = useMemo(
    () => categories.find((c) => c.slug === category)?.subgenres ?? [],
    [category]
  );
  const [subgenre, setSubgenre] = useState<string>("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [genGenre, setGenGenre] = useState<string>("trivia");
  const [genCount, setGenCount] = useState<number>(8);
  const [genDifficulty, setGenDifficulty] = useState<
    "easy" | "normal" | "hard" | "mixed"
  >("normal");
  const [generating, setGenerating] = useState(false);
  const [parallelRunning, setParallelRunning] = useState(false);
  const [parallelCount, setParallelCount] = useState<number>(3);
  const [preview, setPreview] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPrompt, setTestPrompt] = useState<string>(
    "JSON配列で4択クイズを2問だけ返してください。各要素は {id,prompt,choices(4),answerIndex} を必須とし、前後に説明やコードフェンスを入れないでください。ジャンルは雑学。"
  );
  const [testExtractJson, setTestExtractJson] = useState<boolean>(true);
  const [testMaxTokens, setTestMaxTokens] = useState<number>(1800);
  const [testResult, setTestResult] = useState<string>("");
  const [rawPayload, setRawPayload] = useState<string>(
    JSON.stringify(
      {
        model: "gpt-5-nano",
        input: "Return an array of 2 quiz items in JSON only.",
        max_output_tokens: 1000,
      },
      null,
      2
    )
  );
  const [rawResult, setRawResult] = useState<string>("");

  function resetForm() {
    setPrompt("");
    setChoices(["", "", "", ""]);
    setAnswerIndex(0);
    setExplanation("");
    setInfo(null);
    setError(null);
  }

  function addItem() {
    setError(null);
    setInfo(null);
    const q: Question = {
      id: genId(),
      prompt: prompt.trim(),
      choices: choices.map((c) => c.trim()),
      answerIndex,
      explanation: explanation.trim() || undefined,
      category,
      subgenre: subgenre || undefined,
      difficulty,
      source: "editor:admin",
    };
    const res = QuestionSchema.safeParse(q);
    if (!res.success) {
      setError(
        "入力に誤りがあります: " +
          res.error.issues.map((i) => i.message).join(", ")
      );
      return;
    }
    setItems((prev) => [res.data, ...prev]);
    resetForm();
    setInfo("1件追加しました。");
  }

  function copyJSON() {
    const json = JSON.stringify(items, null, 2);
    navigator.clipboard
      .writeText(json)
      .then(() => setInfo("JSONをコピーしました。"));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveAll() {
    if (items.length === 0) {
      setError("保存対象がありません。");
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/questions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // 任意: 環境に ADMIN_TOKEN を設定した場合は一致させる
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({ items }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `保存に失敗しました (HTTP ${r.status})`);
      setInfo(`保存しました（${data.inserted}件）。`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function generateByGenre() {
    setGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/generate-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          genre: genGenre,
          count: genCount,
          difficulty: genDifficulty,
          language: "ja",
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        // サーバが raw を返す場合は詳細を表示
        if (data?.raw) {
          setError(
            (data?.error || "生成に失敗しました") +
              "\nraw: " +
              String(data.raw).slice(0, 500)
          );
        }
        throw new Error(data?.error || `生成に失敗しました (HTTP ${r.status})`);
      }
      setInfo(`生成・保存しました（${data.inserted}件）。`);
      await loadPreview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function previewGenerate() {
    setGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(`/api/admin/generate-batch?dry=1`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          genre: genGenre,
          count: genCount,
          difficulty: genDifficulty,
          language: "ja",
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `生成に失敗しました (HTTP ${r.status})`);
      // 生成結果をプレビュー欄に流す
      setPreview(
        (data.items || []).map((q: any) => ({
          id: q.id,
          prompt: q.prompt,
          category: q.category,
          difficulty: q.difficulty,
          source: q.source,
          created_at: new Date().toISOString(),
        }))
      );
      setInfo(
        `生成プレビューを表示しました（${
          (data.items || []).length
        }件、保存なし）。`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function generateInParallel() {
    if (parallelCount < 1) return;
    setParallelRunning(true);
    setError(null);
    setInfo(null);
    try {
      const payload = {
        genre: genGenre,
        count: genCount,
        difficulty: genDifficulty,
        language: "ja",
      } as const;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
          ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN as string }
          : {}),
      };
      const jobs = Array.from({ length: parallelCount }, async () => {
        const r = await fetch("/api/admin/generate-batch", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data as { inserted?: number };
      });
      const results = await Promise.allSettled(jobs);
      const ok = results.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ inserted?: number }>[];
      const ng = results.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
      const insertedTotal = ok.reduce((sum, r) => sum + (r.value?.inserted ?? 0), 0);
      setInfo(`並列実行完了: 成功 ${ok.length} / ${results.length}、保存 ${insertedTotal} 件`);
      if (ng.length) setError(`失敗 ${ng.length} 件（コンソール参照）`);
      try { console.log("[admin] parallel results", results); } catch {}
      await loadPreview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParallelRunning(false);
    }
  }

  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const qs = new URLSearchParams();
      if (genGenre.trim()) qs.set("category", genGenre.trim());
      qs.set("limit", "20");
      const r = await fetch(`/api/admin/questions?${qs.toString()}`);
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `取得に失敗しました (HTTP ${r.status})`);
      setPreview(data.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function testOpenAI() {
    setTesting(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/test-openai", {
        headers: {
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
      });
      const data = await r.json();
      if (!r.ok || !data.ok)
        throw new Error(
          data?.body || data?.error || `失敗しました (HTTP ${r.status})`
        );
      setInfo("OpenAI接続: OK（呼び出し成功）");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function sendTestPrompt() {
    setTesting(true);
    setError(null);
    setInfo(null);
    setTestResult("");
    try {
      const r = await fetch("/api/admin/test-prompt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          prompt: testPrompt,
          maxTokens: testMaxTokens,
          extractJson: testExtractJson,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok)
        throw new Error(
          data?.body || data?.error || `失敗しました (HTTP ${r.status})`
        );
      const out =
        testExtractJson && data.extracted ? data.extracted : data.content;
      setTestResult(
        typeof out === "string" ? out : JSON.stringify(out, null, 2)
      );
      setInfo("テストプロンプト送信: 成功");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function sendRawPayload() {
    setTesting(true);
    setError(null);
    setInfo(null);
    setRawResult("");
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(rawPayload);
      } catch {
        throw new Error("RAW JSON が不正です");
      }
      const r = await fetch("/api/admin/test-raw", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify(parsed),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          data?.body?.error?.message ||
            data?.error ||
            `失敗しました (HTTP ${r.status})`
        );
      setRawResult(JSON.stringify(data, null, 2));
      setInfo("RAW送信: 成功");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">管理: 問題作成</h1>
        <p className="text-white/70 text-sm mt-1">
          事前作成データ用のエディタ。JSONにエクスポートして `data/questions.ts`
          へ反映してください。
        </p>
      </header>

      <div className="card p-5 grid gap-4">
        <div className="grid gap-3">
          <div>
            <label className="block text-sm mb-2">カテゴリ（固定）</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c) => {
                const active = c.slug === category;
                return (
                  <button
                    type="button"
                    key={c.slug}
                    onClick={() => {
                      setCategory(c.slug);
                      setSubgenre("");
                    }}
                    className={`btn ${
                      active ? "btn-primary" : "btn-ghost"
                    } w-full`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">サブジャンル</label>
              <select
                className="w-full bg-transparent border border-white/10 rounded-md p-2"
                value={subgenre}
                onChange={(e) => setSubgenre(e.target.value)}
              >
                <option value="">（なし）</option>
                {subs.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">難易度</label>
              <select
                className="w-full bg-transparent border border-white/10 rounded-md p-2"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option value="easy">easy</option>
                <option value="normal">normal</option>
                <option value="hard">hard</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">設問</label>
          <textarea
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="問題文を入力"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="answer"
                checked={answerIndex === i}
                onChange={() => setAnswerIndex(i)}
              />
              <input
                className="flex-1 bg-transparent border border-white/10 rounded-md p-2"
                value={c}
                onChange={(e) =>
                  setChoices((prev) =>
                    prev.map((v, idx) => (idx === i ? e.target.value : v))
                  )
                }
                placeholder={`選択肢 ${i + 1}`}
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm mb-1">解説（任意）</label>
          <textarea
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="解説を入力（最大300文字）"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button className="btn btn-ghost" onClick={resetForm}>
            リセット
          </button>
          <button className="btn btn-primary" onClick={addItem}>
            問題を追加
          </button>
        </div>

        {error && (
          <div className="p-3 border border-red-500/40 text-red-300 rounded-md">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 border border-green-500/40 text-green-300 rounded-md">
            {info}
          </div>
        )}
      </div>

      <div className="card p-5 grid gap-4">
        <div className="font-semibold">
          ジャンル指定でGPT生成（直接Supabaseへ保存）
        </div>
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm mb-1">ジャンル（固定）</label>
            <select
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={genGenre}
              onChange={(e) => setGenGenre(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">件数</label>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={genCount}
              onChange={(e) =>
                setGenCount(
                  Math.max(1, Math.min(20, Number(e.target.value) || 1))
                )
              }
            />
          </div>
          <div>
            <label className="block text-sm mb-1">難易度</label>
            <select
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={genDifficulty}
              onChange={(e) => setGenDifficulty(e.target.value as any)}
            >
              <option value="easy">easy</option>
              <option value="normal">normal</option>
              <option value="hard">hard</option>
              <option value="mixed">mixed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">並列数</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={parallelCount}
              onChange={(e) =>
                setParallelCount(
                  Math.max(1, Math.min(10, Number(e.target.value) || 1))
                )
              }
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            className="btn btn-primary"
            onClick={generateByGenre}
            disabled={generating}
          >
            {generating ? "生成中..." : "生成して保存"}
          </button>
          <button
            className="btn btn-primary"
            onClick={generateInParallel}
            disabled={parallelRunning}
          >
            {parallelRunning ? "並列中..." : "並列で生成・保存"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={previewGenerate}
            disabled={generating}
          >
            生成プレビュー
          </button>
          <button
            className="btn btn-ghost"
            onClick={loadPreview}
            disabled={loadingPreview}
          >
            {loadingPreview ? "読み込み中..." : "最新を取得"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={testOpenAI}
            disabled={testing}
          >
            {testing ? "テスト中..." : "OpenAI接続テスト"}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex justify-between items-center mb-3">
          <div className="font-semibold">作成した問題（{items.length}件）</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setItems([])}>
              全削除
            </button>
            <button className="btn btn-success" onClick={copyJSON}>
              JSONをコピー
            </button>
            <button
              className="btn btn-primary"
              onClick={saveAll}
              disabled={saving}
            >
              {saving ? "保存中..." : "Supabaseに保存"}
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {items.map((q) => (
            <div key={q.id} className="p-3 border border-white/10 rounded-md">
              <div className="text-sm text-white/60 mb-1">
                {q.category}
                {q.subgenre ? ` / ${q.subgenre}` : ""} ・ {q.difficulty}
              </div>
              <div className="font-semibold mb-1">{q.prompt}</div>
              <ol className="list-decimal ml-5">
                {q.choices.map((c, i) => (
                  <li
                    key={i}
                    className={
                      i === q.answerIndex ? "text-green-400" : undefined
                    }
                  >
                    {c}
                  </li>
                ))}
              </ol>
              {q.explanation && (
                <div className="text-sm text-white/80 mt-1">
                  解説: {q.explanation}
                </div>
              )}
              <div className="text-right">
                <button
                  className="btn btn-ghost mt-2"
                  onClick={() => remove(q.id)}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-white/60">まだ追加されていません。</div>
          )}
        </div>
      </div>
    </div>
  );
}
