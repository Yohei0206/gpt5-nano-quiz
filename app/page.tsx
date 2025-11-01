"use client";
import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/store";
import type { Difficulty } from "@/lib/types";
import { useCatalogData } from "@/lib/hooks/useCatalogData";
import { useTopicData } from "@/lib/hooks/useTopicData";

function HomeInner() {
  const router = useRouter();
  const { setQuestions, reset } = useQuiz();
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [count, setCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    data: categories,
    loading: catLoading,
    error: catError,
  } = useCatalogData();
  const [title, setTitle] = useState("");
  const {
    data: topics,
    loading: topLoading,
    error: topError,
  } = useTopicData();

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "未指定" },
      ...categories.map((c) => ({ value: c.slug, label: c.label })),
    ],
    [categories]
  );

  // カテゴリ変更時、サブジャンル選択はリセット
  useEffect(() => {
    const matched = topics.find((t) => t.label === title && (t.category ?? "") === (category || ""));
    if (!matched) setTitle("");
  }, [category, topics]);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const payload: any = { difficulty, count, language: "ja" };
      if (category) payload.category = category;
      if (title.trim()) payload.title = title.trim();
      const r = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data?.error || `失敗しました (HTTP ${r.status})`);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
          "問題が取得できませんでした。条件を変えて再試行してください。"
        );
      }
      setQuestions(data);
      router.push("/play");
    } catch (e) {
      setError((e as Error).message);
      reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">GPT‑5 Nano クイズ</h1>
        <p className="text-white/70 mt-1">MVP: 4択・一般教養クイズ</p>
      </header>

      <div className="grid gap-4">
        <div className="card p-5 grid gap-2">
          <label className="block text-sm">ジャンル（未指定可）</label>
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <div>
              <Select
                value={category}
                onChange={(v) => setCategory(v)}
                options={categoryOptions}
              />
            </div>
            {catLoading && (
              <div className="text-sm text-white/60">読み込み中...</div>
            )}
            {catError && <div className="text-sm text-red-400">{catError}</div>}
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-sm">サブジャンル（任意・登録から選択）</label>
              <Select
                value={title}
                onChange={(v) => setTitle(v)}
                options={[
                  { value: "", label: "未指定" },
                  ...topics
                    .filter((t) => (t.category ?? "") === (category || ""))
                    .map((t) => ({ value: t.label, label: t.label })),
                ]}
              />
            </div>
            {topLoading && (
              <div className="text-sm text-white/60">サブジャンル一覧 読み込み中...</div>
            )}
            {topError && <div className="text-sm text-red-400">{topError}</div>}
          </div>
          <div className="text-xs text-white/60 mt-1">
            サブジャンルは選択中のジャンルに紐づくもののみ表示します。
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">対戦モード</div>
            <div className="text-sm text-white/70">
              友だちと同時参加のクイズ対戦
            </div>
          </div>
          <a className="btn btn-ghost" href="/play/buzzer">
            移動
          </a>
        </div>

        <div className="card p-5 grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">難易度</label>
            <Select
              value={difficulty}
              onChange={(v) => setDifficulty(v as Difficulty)}
              options={[
                { value: "easy", label: "easy" },
                { value: "normal", label: "normal" },
                { value: "hard", label: "hard" },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">出題数</label>
            <Select
              value={String(count)}
              onChange={(v) => setCount(Math.max(1, Math.min(10, Number(v) || 1)))}
              options={Array.from({ length: 10 }, (_, i) => {
                const n = i + 1;
                return { value: String(n), label: String(n) };
              })}
            />
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              onClick={start}
              disabled={loading}
            >
              {loading ? "生成中..." : "スタート"}
            </button>
          </div>
        </div>

        {error && (
          <div className="card p-4 text-red-300 border-red-500/40 border">
            エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeInner />;
}
