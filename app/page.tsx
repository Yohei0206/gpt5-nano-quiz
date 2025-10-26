"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/store";
import type { Difficulty } from "@/lib/types";

const CATEGORIES: { slug: string; label: string }[] = [
  { slug: "", label: "未指定" },
  { slug: "general", label: "一般教養" },
  { slug: "science", label: "理系・科学" },
  { slug: "entertainment", label: "文化・エンタメ" },
  { slug: "otaku", label: "アニメ・ゲーム・漫画" },
  { slug: "trivia", label: "雑学" },
  { slug: "japan", label: "日本" },
  { slug: "world", label: "世界" },
  { slug: "society", label: "時事・社会" },
];

function HomeInner() {
  const router = useRouter();
  const { setQuestions, reset } = useQuiz();
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [count, setCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const payload: any = { difficulty, count, language: "ja" };
      if (category) payload.category = category;
      const r = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `失敗しました (HTTP ${r.status})`);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("問題が取得できませんでした。条件を変えて再試行してください。");
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
        <div className="card p-5">
          <label className="block text-sm mb-2">ジャンル（未指定可）</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug || "any"}
                type="button"
                className={`btn ${category === c.slug ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setCategory(c.slug)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5 grid sm:grid-cols-3 gap-4">
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
          <div>
            <label className="block text-sm mb-1">出題数</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary w-full" onClick={start} disabled={loading}>
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

      <footer className="text-center text-sm text-white/60">
        gpt-5-nano のみ使用。APIキーはサーバ側で保持。
      </footer>
    </div>
  );
}

export default function Home() { return <HomeInner />; }
