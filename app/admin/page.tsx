"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Difficulty, Question } from "@/lib/types";
import CategoryManager from "./components/CategoryManager";
import SubgenreManager from "./components/SubgenreManager";
import GenerationSection from "./components/GenerationSection";
import ManualQuestionForm from "./components/ManualQuestionForm";
import PreviewSection from "./components/PreviewSection";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type CategoryItem = { slug: string; label: string };
type TopicItem = { slug: string; label: string; category?: string | null };

type PreviewItem = {
  id: string;
  prompt: string;
  category?: string;
  difficulty?: string;
  source?: string;
  created_at?: string;
  subgenre?: string | null;
};

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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function readFirstMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = readFirstMessage(entry);
      if (nested) return nested;
    }
    return null;
  }
  const record = toRecord(value);
  if (!record) return null;
  for (const key of ["message", "error", "detail"]) {
    const nested = readFirstMessage(record[key]);
    if (nested) return nested;
  }
  return null;
}

function extractErrorMessage(data: unknown): string | null {
  const record = toRecord(data);
  if (!record) return readFirstMessage(data);
  for (const key of ["error", "message", "body", "detail", "details"]) {
    const message = readFirstMessage(record[key]);
    if (message) return message;
  }
  return null;
}

function AdminLogin({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setInfo("ログインしました");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto bg-white/5 border border-white/10 rounded-lg p-6 text-sm">
      <h1 className="text-lg font-semibold mb-4">管理者ログイン</h1>
      <p className="text-white/60 mb-4">
        管理者用メールアドレスとパスワードでサインインしてください。
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="admin-email" className="block text-white/80">
            メールアドレス
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded bg-white/10 border border-white/20 px-3 py-2 text-white"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="admin-password" className="block text-white/80">
            パスワード
          </label>
          <input
            id="admin-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded bg-white/10 border border-white/20 px-3 py-2 text-white"
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-white/80 text-black font-semibold py-2 hover:bg-white disabled:opacity-60"
        >
          {loading ? "認証中..." : "ログイン"}
        </button>
      </form>
      {error && <p className="text-red-400 mt-4">{error}</p>}
      {info && <p className="text-emerald-300 mt-4">{info}</p>}
    </div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // DB categories
  const [dbCategories, setDbCategories] = useState<CategoryItem[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Selected category for manual add (fallback to first when loaded)
  const [category, setCategory] = useState<string>("");
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
  const [previewing, setPreviewing] = useState(false);
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
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // サブジャンル（DB: topics）
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setAuthChecked(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setAuthChecked(true);
      }
    );
    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Load categories from DB
  useEffect(() => {
    if (!session) return;
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
          if (mapped.length) {
            const firstSlug = mapped[0].slug;
            setGenGenre((prev) =>
              prev && mapped.some((c) => c.slug === prev) ? prev : firstSlug
            );
            setCategory((prev) => {
              if (prev && mapped.some((c) => c.slug === prev)) return prev;
              return firstSlug;
            });
            setTopicCatForAdd((prev) => {
              if (prev && mapped.some((c) => c.slug === prev)) return prev;
              return firstSlug;
            });
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
  }, [session]);

  // サブジャンル一覧を読み込み
  useEffect(() => {
    if (!session) return;
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
  }, [session]);

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

  const categoryOptions = useMemo(
    () =>
      dbCategories.map((c) => ({
        value: c.slug,
        label: c.label,
      })),
    [dbCategories]
  );
  const manualTopicOptions = useMemo(() => {
    const list = topics.filter((t) => (t.category ?? "") === category);
    return [
      { value: "", label: "(未指定)" },
      ...list.map((t) => ({ value: t.slug, label: t.label })),
    ];
  }, [topics, category]);

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
        throw new Error(
          extractErrorMessage(data) ??
            `追加に失敗しました (HTTP ${r.status})`
        );
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
        throw new Error(
          extractErrorMessage(data) ??
            `保存に失敗しました (HTTP ${r.status})`
        );
      setInfo(`保存しました（${data.inserted}件）。`);
      await loadPreview();
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
        const record = toRecord(data);
        const errorMessage = extractErrorMessage(data);
        const uiMessage = errorMessage ?? "生成に失敗しました";
        // サーバが raw を返す場合は詳細を表示
        if (record?.raw) {
          setError(`${uiMessage}\nraw: ${String(record.raw).slice(0, 500)}`);
        }
        throw new Error(
          errorMessage ?? `生成に失敗しました (HTTP ${r.status})`
        );
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
    setPreviewing(true);
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
        throw new Error(
          extractErrorMessage(data) ??
            `生成に失敗しました (HTTP ${r.status})`
        );
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
      setPreviewing(false);
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
        if (!r.ok)
          throw new Error(
            extractErrorMessage(data) ?? `HTTP ${r.status}`
          );
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
    if (!session) return;
    setLoadingPreview(true);
    try {
      const qs = new URLSearchParams();
      if (genGenre.trim()) qs.set("category", genGenre.trim());
      qs.set("limit", "20");
      const r = await fetch(`/api/admin/questions?${qs.toString()}`);
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          extractErrorMessage(data) ??
            `取得に失敗しました (HTTP ${r.status})`
        );
      setPreview((data.items || []) as PreviewItem[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    void loadPreview();
  }, [session]);

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
        throw new Error(
          extractErrorMessage(data) ??
            `失敗しました (HTTP ${r.status})`
        );
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
        throw new Error(
          extractErrorMessage(data) ??
            `追加に失敗しました (HTTP ${r.status})`
        );
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

  const userEmail = session?.user?.email ?? "";

  async function handleSignOut() {
    if (!supabase) {
      setError("Supabase クライアントを初期化できませんでした");
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!supabase) {
    return (
      <div className="text-center text-sm text-red-300">
        Supabase クライアントを初期化できませんでした。環境変数
        <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code>
        と
        <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        を設定してください。
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="text-center text-sm text-white/70">
        認証状態を確認しています...
      </div>
    );
  }

  if (!session) {
    return <AdminLogin supabase={supabase} />;
  }

  const manualCategoriesOptions = categoryOptions.length
    ? categoryOptions
    : [{ value: "", label: "(ジャンル未取得)" }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3 text-xs text-white/70">
        {userEmail && <span>{userEmail}</span>}
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded border border-white/20 px-3 py-1 text-white/80 hover:text-white hover:border-white/40"
        >
          サインアウト
        </button>
      </div>
      <header className="text-center">
        <h1 className="text-2xl font-bold">管理: 問題作成</h1>
        <p className="text-white/70 text-sm mt-1">
          Supabase の `public.questions` へ直接保存する管理用エディタです。保存
          操作で即時に反映されるため、必要に応じて JSON コピーで控えも確保し
          てください。
        </p>
      </header>
      <div className="flex justify-end">
        <a className="btn btn-ghost btn-sm" href="/admin/review">
          問題一覧・修正依頼
        </a>
      </div>

      {(info || error) && (
        <div className="grid gap-2">
          {info && (
            <div className="border border-emerald-400/40 bg-emerald-500/10 text-emerald-100 text-sm rounded-md px-4 py-2">
              {info}
            </div>
          )}
          {error && (
            <div className="border border-red-400/40 bg-red-500/10 text-red-100 text-sm rounded-md px-4 py-2 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>
      )}

      <ManualQuestionForm
        category={category}
        onChangeCategory={setCategory}
        subgenre={subgenre}
        onChangeSubgenre={setSubgenre}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        prompt={prompt}
        onChangePrompt={setPrompt}
        choices={choices}
        onChangeChoice={(index, value) =>
          setChoices((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
          })
        }
        answerIndex={answerIndex}
        onChangeAnswerIndex={setAnswerIndex}
        explanation={explanation}
        onChangeExplanation={setExplanation}
        onAdd={addItem}
        onReset={resetForm}
        onCopyJSON={copyJSON}
        onSaveAll={saveAll}
        items={items}
        onRemove={remove}
        categories={manualCategoriesOptions}
        subgenreOptions={manualTopicOptions}
        saving={saving}
      />

      <CategoryManager
        slug={newCatSlug}
        label={newCatLabel}
        onChangeSlug={setNewCatSlug}
        onChangeLabel={setNewCatLabel}
        onSubmit={addCategory}
        loading={addingCategory}
      />

      <SubgenreManager
        slug={newTopicSlug}
        label={newTopicLabel}
        category={topicCatForAdd}
        categories={manualCategoriesOptions}
        onChangeSlug={setNewTopicSlug}
        onChangeLabel={setNewTopicLabel}
        onChangeCategory={setTopicCatForAdd}
        onSubmit={addTopic}
        loading={addingTopic}
      />

      <GenerationSection
        categories={manualCategoriesOptions}
        genGenre={genGenre}
        onChangeGenre={setGenGenre}
        genTitleSlug={genTitleSlug}
        onChangeTitleSlug={setGenTitleSlug}
        topicOptions={topicOptions}
        genCount={genCount}
        onChangeCount={setGenCount}
        genDifficulty={genDifficulty}
        onChangeDifficulty={setGenDifficulty}
        parallelCount={parallelCount}
        onChangeParallelCount={setParallelCount}
        onGenerate={generateByGenre}
        onPreview={previewGenerate}
        onGenerateParallel={generateInParallel}
        onRebalance={rebalanceAnswers}
        generating={generating}
        previewing={previewing}
        parallelRunning={parallelRunning}
        rebalancing={rebalancing}
        catLoading={catLoading}
        catError={catError}
        topicsLoading={topicsLoading}
        topicsError={topicsError}
        rebalanceLimit={rebalanceLimit}
        onChangeRebalanceLimit={setRebalanceLimit}
      />

      <PreviewSection
        items={preview}
        loading={loadingPreview}
        onReload={loadPreview}
      />
    </div>
  );
}
