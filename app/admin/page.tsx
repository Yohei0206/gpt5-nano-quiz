"use client";
import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { z } from "zod";
import type { Difficulty, Question } from "@/lib/types";

// 固定カテゴリ + サブジャンル（旧仕様）
// 現在はDBから取得するため空にする
const categories: {
  slug: string;
  label: string;
  subgenres: { slug: string; label: string }[];
}[] = [];
type CategoryItem = { slug: string; label: string };
type TopicItem = { slug: string; label: string; category?: string | null };

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
  // DB categories
  const [dbCategories, setDbCategories] = useState<CategoryItem[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Selected category for manual add (fallback to first when loaded)
  const [category, setCategory] = useState<string>("");
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
  const [genTitle, setGenTitle] = useState<string>("");
  const [genTitleSlug, setGenTitleSlug] = useState<string>("");
  const [genCount, setGenCount] = useState<number>(8);
  const [genDifficulty, setGenDifficulty] = useState<
    "easy" | "normal" | "hard" | "mixed"
  >("normal");
  const [generating, setGenerating] = useState(false);
  const [parallelRunning, setParallelRunning] = useState(false);
  const [parallelCount, setParallelCount] = useState<number>(3);
  // 回答番号均等化
  const [rebalanceLimit, setRebalanceLimit] = useState<number>(100);
  const [rebalancing, setRebalancing] = useState(false);
  // トピック追加
  const [newTopicSlug, setNewTopicSlug] = useState("");
  const [newTopicLabel, setNewTopicLabel] = useState("");
  const [topicCatForAdd, setTopicCatForAdd] = useState<string>("");
  const [addingTopic, setAddingTopic] = useState(false);
  // カテゴリー追加用フォーム
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
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
  const [logs, setLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState("");
  // サブジャンル（DB: topics）
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // Load categories from DB
  useEffect(() => {
    let alive = true;
    (async () => {
      setCatLoading(true);
      setCatError(null);
      try {
        const r = await fetch("/api/categories", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const items = Array.isArray(j?.items) ? j.items : [];
        const mapped = items.map((x: any) => ({
          slug: x.slug,
          label: x.label,
        })) as CategoryItem[];
        if (alive) {
          setDbCategories(mapped);
          // Initialize selects if current values are not in the new list
          if (mapped.length) {
            if (!mapped.some((c) => c.slug === genGenre))
              setGenGenre(mapped[0].slug);
            if (!category || !mapped.some((c) => c.slug === category))
              setCategory(mapped[0].slug);
            if (
              !topicCatForAdd ||
              !mapped.some((c) => c.slug === topicCatForAdd)
            )
              setTopicCatForAdd(mapped[0].slug);
          }
        }
      } catch (e) {
        if (alive) setCatError((e as Error).message);
      } finally {
        if (alive) setCatLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // サブジャンル一覧を読み込み
  useEffect(() => {
    let alive = true;
    (async () => {
      setTopicsLoading(true);
      setTopicsError(null);
      try {
        const r = await fetch("/api/topics", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const items = Array.isArray(j?.items) ? j.items : [];
        const mapped = items.map((x: any) => ({
          slug: x.slug,
          label: x.label,
          category: x.category ?? null,
        })) as TopicItem[];
        if (alive) setTopics(mapped);
      } catch (e) {
        if (alive) setTopicsError((e as Error).message);
      } finally {
        if (alive) setTopicsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 選択中のサブジャンルに応じて表示用ラベルを同期
  const selectedGenTopic = useMemo(
    () =>
      topics.find(
        (t) => t.slug === genTitleSlug && (t.category ?? undefined) === genGenre
      ),
    [topics, genTitleSlug, genGenre]
  );
  useEffect(() => {
    setGenTitle(selectedGenTopic?.label ?? "");
  }, [selectedGenTopic]);
  useEffect(() => {
    if (!selectedGenTopic) {
      setGenTitleSlug("");
      setGenTitle("");
    }
  }, [genGenre]);

  // サブジャンルプルダウン用オプション（カテゴリ一致のみ表示）
  const topicOptions = useMemo(() => {
    const list = topics.filter((t) => (t.category ?? "") === genGenre);
    return [
      { value: "", label: "(未指定)" },
      ...list.map((t) => ({ value: t.slug, label: t.label })),
    ];
  }, [topics, genGenre]);

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

  async function addCategory() {
    if (!newCatSlug.trim() || !newCatLabel.trim()) {
      setError("スラッグと表示名を入力してください");
      return;
    }
    setAddingCategory(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          slug: newCatSlug.trim(),
          label: newCatLabel.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `追加に失敗しました (HTTP ${r.status})`);
      setInfo(`カテゴリーを追加しました: ${data.item?.label || newCatLabel}`);
      setNewCatSlug("");
      setNewCatLabel("");
      // Refresh categories after successful addition
      try {
        setCatLoading(true);
        const r2 = await fetch("/api/categories", { cache: "no-store" });
        const j2 = await r2.json();
        if (r2.ok && Array.isArray(j2?.items)) {
          const mapped = j2.items.map((x: any) => ({
            slug: x.slug,
            label: x.label,
          })) as CategoryItem[];
          setDbCategories(mapped);
          if (mapped.length && !mapped.some((c) => c.slug === genGenre))
            setGenGenre(mapped[0].slug);
        }
      } catch {
      } finally {
        setCatLoading(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingCategory(false);
    }
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
          ...(genTitle.trim() ? { title: genTitle.trim() } : {}),
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
          ...(genTitle.trim() ? { title: genTitle.trim() } : {}),
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
        ...(genTitle.trim() ? { title: genTitle.trim() } : {}),
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
      const ok = results.filter(
        (x) => x.status === "fulfilled"
      ) as PromiseFulfilledResult<{ inserted?: number }>[];
      const ng = results.filter(
        (x) => x.status === "rejected"
      ) as PromiseRejectedResult[];
      const insertedTotal = ok.reduce(
        (sum, r) => sum + (r.value?.inserted ?? 0),
        0
      );
      setInfo(
        `並列実行完了: 成功 ${ok.length} / ${results.length}、保存 ${insertedTotal} 件`
      );
      if (ng.length) setError(`失敗 ${ng.length} 件（コンソール参照）`);
      try {
        console.log("[admin] parallel results", results);
      } catch {}
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

  async function rebalanceAnswers() {
    setRebalancing(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/rebalance", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({ category: genGenre, limit: rebalanceLimit }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `失敗しました (HTTP ${r.status})`);
      setInfo(
        `回答位置を再配置しました（更新 ${data.updated} 件、分布 ${(
          data.distribution || []
        ).join(",")}）。`
      );
      await loadPreview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRebalancing(false);
    }
  }

  async function addTopic() {
    if (!newTopicSlug.trim() || !newTopicLabel.trim()) {
      setError("サブジャンルのスラッグと名称を入力してください");
      return;
    }
    if (!topicCatForAdd.trim()) {
      setError("サブジャンルの所属ジャンルを選択してください");
      return;
    }
    setAddingTopic(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ADMIN_TOKEN
            ? { "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          slug: newTopicSlug.trim(),
          label: newTopicLabel.trim(),
          category: topicCatForAdd.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `追加に失敗しました (HTTP ${r.status})`);
      setInfo(
        `サブジャンルを追加しました: ${data.item?.label || newTopicLabel}`
      );
      setNewTopicSlug("");
      setNewTopicLabel("");
      // 追加後にサブジャンル一覧を再取得
      try {
        setTopicsLoading(true);
        const r2 = await fetch("/api/topics", { cache: "no-store" });
        const j2 = await r2.json();
        if (r2.ok && Array.isArray(j2?.items)) {
          const mapped = j2.items.map((x: any) => ({
            slug: x.slug,
            label: x.label,
            category: x.category ?? null,
          })) as TopicItem[];
          setTopics(mapped);
        }
      } catch {
      } finally {
        setTopicsLoading(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingTopic(false);
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
        <div className="font-semibold">カテゴリー管理</div>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">
              スラッグ（英数字・ハイフン）
            </label>
            <input
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              placeholder="例: doraemon"
              value={newCatSlug}
              onChange={(e) => setNewCatSlug(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">表示名</label>
            <input
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              placeholder="例: ドラえもん"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
            />
          </div>
          <div>
            <button
              className="btn btn-primary w-full"
              onClick={addCategory}
              disabled={addingCategory}
            >
              {addingCategory ? "追加中..." : "カテゴリー追加"}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5 grid gap-4">
        <div className="font-semibold">サブジャンル管理</div>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">
              サブジャンルのスラッグ（英数字・ハイフン）
            </label>
            <input
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              placeholder="例: dragon-ball"
              value={newTopicSlug}
              onChange={(e) => setNewTopicSlug(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">サブジャンル名</label>
            <input
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              placeholder="例: ドラゴンボール"
              value={newTopicLabel}
              onChange={(e) => setNewTopicLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">所属ジャンル</label>
            <Select
              value={topicCatForAdd}
              onChange={setTopicCatForAdd}
              options={dbCategories.map((c) => ({
                value: c.slug,
                label: c.label,
              }))}
            />
          </div>
          <div>
            <button
              className="btn btn-primary w-full"
              onClick={addTopic}
              disabled={addingTopic}
            >
              {addingTopic ? "追加中..." : "サブジャンル追加"}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5 grid gap-4">
        <div className="font-semibold">
          ジャンル指定でGPT生成（直接Supabaseへ保存）
        </div>
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm mb-1">ジャンル</label>
            <Select
              value={genGenre}
              onChange={setGenGenre}
              options={dbCategories.map((c) => ({
                value: c.slug,
                label: c.label,
              }))}
            />
            {catLoading && (
              <div className="text-xs text-white/60 mt-1">読込中...</div>
            )}
            {catError && (
              <div className="text-xs text-red-400 mt-1">{catError}</div>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">サブジャンル</label>
            <Select
              value={genTitleSlug}
              onChange={(v) => setGenTitleSlug(v)}
              options={topicOptions}
            />
            {topicsLoading && (
              <div className="text-xs text-white/60 mt-1">
                サブジャンル読込中...
              </div>
            )}
            {topicsError && (
              <div className="text-xs text-red-400 mt-1">{topicsError}</div>
            )}
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
            <Select
              value={genDifficulty}
              onChange={(v) => setGenDifficulty(v as any)}
              options={[
                { value: "easy", label: "easy" },
                { value: "normal", label: "normal" },
                { value: "hard", label: "hard" },
                { value: "mixed", label: "mixed" },
              ]}
            />
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
        </div>
      </div>

      <div className="card p-5 grid gap-4">
        <div className="font-semibold">回答番号の一括並び替え（均等化）</div>
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm mb-1">対象ジャンル</label>
            <Select
              value={genGenre}
              onChange={setGenGenre}
              options={dbCategories.map((c) => ({
                value: c.slug,
                label: c.label,
              }))}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">対象件数（新しい順）</label>
            <input
              type="number"
              min={1}
              max={500}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={rebalanceLimit}
              onChange={(e) =>
                setRebalanceLimit(
                  Math.max(1, Math.min(500, Number(e.target.value) || 1))
                )
              }
            />
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              onClick={rebalanceAnswers}
              disabled={rebalancing}
            >
              {rebalancing ? "並び替え中..." : "回答位置を均等化"}
            </button>
          </div>
        </div>
        <div className="text-xs text-white/60">
          指定ジャンルの直近N件について、正解の位置を 0→1→2→3→…
          の順で再配置します。
          問題本文や選択肢内容は変更せず、選択肢の並びのみ入れ替えます。
        </div>
      </div>
    </div>
  );
}
