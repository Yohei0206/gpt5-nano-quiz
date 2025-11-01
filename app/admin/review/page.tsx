"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";

type CategoryOption = { value: string; label: string };

type AdminQuestion = {
  id: number | string;
  prompt: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string | null;
  category: string;
  difficulty: string;
  source: string;
  subgenre: string | null;
  created_at: string;
};

type QuestionReport = {
  id: number | string;
  questionId: string | null;
  prompt: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string | null;
  category: string | null;
  mode: "single" | "versus";
  context: Record<string, unknown> | null;
  created_at: string;
  handled?: boolean;
};

const QUESTION_PAGE_SIZE = 20;
const REPORT_PAGE_SIZE = 20;
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return dateFormatter.format(d);
}

type QuestionEditForm = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  category: string;
  difficulty: "easy" | "normal" | "hard";
  source: string;
  subgenre: string;
};

export default function AdminReviewPage() {
  const [tab, setTab] = useState<"questions" | "reports">("questions");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([
    { value: "all", label: "すべて" },
  ]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Question list filters and state
  const [questionSearchInput, setQuestionSearchInput] = useState("");
  const [questionCategory, setQuestionCategory] = useState("all");
  const [questionDifficulty, setQuestionDifficulty] = useState("all");
  const [questionFilter, setQuestionFilter] = useState({
    q: "",
    category: "",
    difficulty: "",
  });
  const [questionPage, setQuestionPage] = useState(1);
  const [questionItems, setQuestionItems] = useState<AdminQuestion[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionHasMore, setQuestionHasMore] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [questionInfo, setQuestionInfo] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<
    string | number | null
  >(null);
  const [editForm, setEditForm] = useState<QuestionEditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingEditQuestionId, setPendingEditQuestionId] = useState<
    string | null
  >(null);
  const [deleteProcessingId, setDeleteProcessingId] = useState<
    string | number | null
  >(null);

  // Report filters and state
  const [reportSearchInput, setReportSearchInput] = useState("");
  const [reportMode, setReportMode] = useState<"all" | "single" | "versus">(
    "all"
  );
  const [reportFilter, setReportFilter] = useState({
    q: "",
    mode: "all" as "all" | "single" | "versus",
  });
  const [reportPage, setReportPage] = useState(1);
  const [reportItems, setReportItems] = useState<QuestionReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportHasMore, setReportHasMore] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const adminToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN;

  // Load categories once for filters
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoryLoading(true);
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (!cancelled && Array.isArray(data?.items)) {
          const mapped = data.items.map((item: any) => ({
            value: item.slug,
            label: item.label,
          }));
          setCategoryOptions([
            { value: "all", label: "すべて" },
            ...mapped,
          ]);
        }
      } catch {
        if (!cancelled) {
          setCategoryOptions([{ value: "all", label: "すべて" }]);
        }
      } finally {
        if (!cancelled) setCategoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "questions") return;
    let cancelled = false;
    (async () => {
      setQuestionLoading(true);
      setQuestionError(null);
      if (!cancelled) {
        setQuestionInfo(null);
        setEditingQuestionId(null);
        setEditForm(null);
        setEditError(null);
      }
      try {
        const qs = new URLSearchParams();
        qs.set("limit", String(QUESTION_PAGE_SIZE));
        qs.set("page", String(questionPage));
        if (questionFilter.q) qs.set("q", questionFilter.q);
        if (questionFilter.category) qs.set("category", questionFilter.category);
        if (questionFilter.difficulty)
          qs.set("difficulty", questionFilter.difficulty);
        const res = await fetch(`/api/admin/questions?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setQuestionItems(Array.isArray(data?.items) ? data.items : []);
        setQuestionTotal(Number(data?.total) || 0);
        setQuestionHasMore(Boolean(data?.hasMore));
      } catch (e) {
        if (!cancelled) setQuestionError((e as Error).message);
      } finally {
        if (!cancelled) setQuestionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, questionFilter, questionPage]);

  useEffect(() => {
    if (tab !== "reports") return;
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      setReportError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("limit", String(REPORT_PAGE_SIZE));
        qs.set("page", String(reportPage));
        if (reportFilter.q) qs.set("q", reportFilter.q);
        if (reportFilter.mode !== "all") qs.set("mode", reportFilter.mode);
        const res = await fetch(
          `/api/admin/question-reports?${qs.toString()}`,
          {
            cache: "no-store",
            headers: {
              ...(adminToken ? { "x-admin-token": adminToken } : {}),
            },
          }
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setReportItems(Array.isArray(data?.items) ? data.items : []);
        setReportTotal(Number(data?.total) || 0);
        setReportHasMore(Boolean(data?.hasMore));
      } catch (e) {
        if (!cancelled) setReportError((e as Error).message);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, reportFilter, reportPage, adminToken]);

  function applyQuestionFilter() {
    setQuestionFilter({
      q: questionSearchInput.trim(),
      category: questionCategory === "all" ? "" : questionCategory,
      difficulty: questionDifficulty === "all" ? "" : questionDifficulty,
    });
    setQuestionPage(1);
  }

  function resetQuestionFilter() {
    setQuestionSearchInput("");
    setQuestionCategory("all");
    setQuestionDifficulty("all");
    setQuestionFilter({ q: "", category: "", difficulty: "" });
    setQuestionPage(1);
  }

  const beginQuestionEdit = useCallback((question: AdminQuestion) => {
    const normalizedDifficulty =
      typeof question.difficulty === "string"
        ? question.difficulty.toLowerCase()
        : "normal";
    const diff: "easy" | "normal" | "hard" =
      normalizedDifficulty === "easy" ||
      normalizedDifficulty === "hard" ||
      normalizedDifficulty === "normal"
        ? (normalizedDifficulty as "easy" | "normal" | "hard")
        : "normal";
    setEditingQuestionId(question.id);
    setEditForm({
      prompt: question.prompt,
      choices: question.choices.map((c) => c ?? ""),
      answerIndex:
        typeof question.answerIndex === "number"
          ? question.answerIndex
          : 0,
      explanation: question.explanation ?? "",
      category: question.category,
      difficulty: diff,
      source: question.source ?? "",
      subgenre: question.subgenre ?? "",
    });
    setEditError(null);
  }, []);

  function cancelQuestionEdit() {
    setEditingQuestionId(null);
    setEditForm(null);
    setEditError(null);
  }

  function updateChoiceValue(index: number, value: string) {
    setEditForm((prev) => {
      if (!prev) return prev;
      const next = [...prev.choices];
      next[index] = value;
      return { ...prev, choices: next };
    });
  }

  async function saveQuestionEdit(questionId: string | number) {
    if (!editForm) return;
    const trimmedPrompt = editForm.prompt.trim();
    if (trimmedPrompt.length < 5) {
      setEditError("問題文は5文字以上で入力してください。");
      return;
    }
    const trimmedChoices = editForm.choices.map((c) => c.trim());
    if (trimmedChoices.some((c) => !c)) {
      setEditError("全ての選択肢を入力してください。");
      return;
    }
    if (editForm.answerIndex < 0 || editForm.answerIndex > 3) {
      setEditError("正解番号が不正です。");
      return;
    }
    const trimmedCategory = editForm.category.trim();
    if (!trimmedCategory) {
      setEditError("カテゴリーを入力してください。");
      return;
    }
    const payload: Record<string, unknown> = {
      prompt: trimmedPrompt,
      choices: trimmedChoices,
      answerIndex: editForm.answerIndex,
      explanation: editForm.explanation.trim()
        ? editForm.explanation.trim()
        : null,
      category: trimmedCategory,
      difficulty: editForm.difficulty,
    };
    if (editForm.source.trim()) payload.source = editForm.source.trim();
    if (editForm.subgenre.trim())
      payload.subgenre = editForm.subgenre.trim();
    else payload.subgenre = null;

    setEditSaving(true);
    setEditError(null);
    try {
      const questionIdStr = String(questionId);
      const res = await fetch(
        `/api/admin/questions/${questionIdStr}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(adminToken ? { "x-admin-token": adminToken } : {}),
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      try {
        await fetch("/api/admin/question-reports/resolve", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(adminToken ? { "x-admin-token": adminToken } : {}),
          },
          body: JSON.stringify({ questionId: questionIdStr }),
        });
      } catch {
        // resolve API が失敗しても致命的ではないため握りつぶす
      }
      const updated = data?.item;
      if (!updated) throw new Error("更新結果を取得できませんでした。");
      setQuestionItems((prev) =>
        prev.map((item) => {
          if (String(item.id) !== questionIdStr) return item;
          return {
            ...item,
            prompt: updated.prompt,
            choices: Array.isArray(updated.choices)
              ? updated.choices
              : item.choices,
            answerIndex:
              typeof updated.answerIndex === "number"
                ? updated.answerIndex
                : null,
            explanation:
              updated.explanation === undefined
                ? item.explanation
                : updated.explanation,
            category: updated.category ?? item.category,
            difficulty: updated.difficulty ?? item.difficulty,
            source: updated.source ?? item.source,
            subgenre:
              updated.subgenre === undefined
                ? item.subgenre
                : updated.subgenre,
            created_at: updated.created_at ?? item.created_at,
          };
        })
      );
      try {
        await fetch("/api/admin/question-reports/resolve", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(adminToken ? { "x-admin-token": adminToken } : {}),
          },
          body: JSON.stringify({ questionId: questionIdStr }),
        });
        let removed = 0;
        setReportItems((prev) => {
          const filtered = prev.filter((item) => item.questionId !== questionIdStr);
          removed = prev.length - filtered.length;
          return filtered;
        });
        if (removed > 0) {
          setReportTotal((prev) => (prev > 0 ? Math.max(0, prev - removed) : prev));
        }
      } catch {
        // 非致命的: ログなどは将来検討
      }
      setQuestionInfo("問題を更新しました。");
      cancelQuestionEdit();
    } catch (e) {
      setEditError((e as Error).message || "更新に失敗しました。");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteQuestion(questionId: string | number) {
    const idStr = String(questionId);
    if (!idStr) {
      setQuestionError("削除対象の問題IDが不正です。");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm("本当にこの問題を削除しますか？");
      if (!ok) return;
    }
    setDeleteProcessingId(questionId);
    setQuestionError(null);
    setQuestionInfo(null);
    try {
      const res = await fetch(`/api/admin/questions/${idStr}`, {
        method: "DELETE",
        headers: {
          ...(adminToken ? { "x-admin-token": adminToken } : {}),
        },
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setQuestionItems((prev) => prev.filter((item) => String(item.id) !== idStr));
      setReportItems((prev) => {
        const filtered = prev.filter(
          (item) => String(item.questionId ?? "") !== idStr
        );
        if (filtered.length !== prev.length) {
          setReportTotal((prevTotal) =>
            Math.max(0, prevTotal - (prev.length - filtered.length))
          );
        }
        return filtered;
      });
      setQuestionInfo("問題を削除しました。");
      if (editingQuestionId === questionId) {
        cancelQuestionEdit();
      }
    } catch (e) {
      setQuestionError((e as Error).message || "削除に失敗しました。");
    } finally {
      setDeleteProcessingId(null);
    }
  }

  useEffect(() => {
    if (!pendingEditQuestionId) return;
    const target = questionItems.find(
      (item) => String(item.id) === pendingEditQuestionId
    );
    if (target) {
      beginQuestionEdit(target);
      setPendingEditQuestionId(null);
      setQuestionInfo("修正依頼から該当問題を開きました。");
      return;
    }
    if (!questionLoading) {
      setPendingEditQuestionId(null);
      setQuestionError(
        `修正依頼の問題が見つかりませんでした (ID: ${pendingEditQuestionId})`
      );
    }
  }, [
    pendingEditQuestionId,
    questionItems,
    questionLoading,
    beginQuestionEdit,
    setQuestionInfo,
    setQuestionError,
  ]);

  function openQuestionFromReport(questionId: string | number | null) {
    if (!questionId && questionId !== 0) {
      setQuestionError("対象の問題IDが指定されていません。");
      return;
    }
    const idStr = String(questionId).trim();
    if (!idStr) {
      setQuestionError("対象の問題IDが不正です。");
      return;
    }
    setTab("questions");
    setQuestionSearchInput(idStr);
    setQuestionCategory("all");
    setQuestionDifficulty("all");
    setQuestionFilter({ q: idStr, category: "", difficulty: "" });
    setQuestionPage(1);
    setQuestionError(null);
    setQuestionInfo(null);
    setPendingEditQuestionId(idStr);
  }

  function applyReportFilter() {
    setReportFilter({
      q: reportSearchInput.trim(),
      mode: reportMode,
    });
    setReportPage(1);
  }

  function resetReportFilter() {
    setReportSearchInput("");
    setReportMode("all");
    setReportFilter({ q: "", mode: "all" });
    setReportPage(1);
  }

  const categoryOptionsForEdit = useMemo(
    () => categoryOptions.filter((opt) => opt.value !== "all"),
    [categoryOptions]
  );
  const effectiveCategoryOptions = useMemo(() => {
    if (!editForm?.category) return categoryOptionsForEdit;
    if (
      categoryOptionsForEdit.some((opt) => opt.value === editForm.category)
    )
      return categoryOptionsForEdit;
    return [
      ...categoryOptionsForEdit,
      { value: editForm.category, label: editForm.category },
    ];
  }, [categoryOptionsForEdit, editForm?.category]);

  const difficultyOptions = useMemo(
    () => [
      { value: "all", label: "すべて" },
      { value: "easy", label: "easy" },
      { value: "normal", label: "normal" },
      { value: "hard", label: "hard" },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">管理: 問題一覧・修正依頼</h1>
        <p className="text-white/70 text-sm mt-1">
          登録済みの問題やユーザーからの修正依頼を確認できます。
        </p>
      </header>

      <div className="flex justify-center gap-3">
        <button
          className={`btn btn-sm ${tab === "questions" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("questions")}
        >
          問題一覧
        </button>
        <button
          className={`btn btn-sm ${tab === "reports" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("reports")}
        >
          修正依頼
        </button>
      </div>

      {tab === "questions" && (
        <div className="grid gap-4">
          <div className="card p-4 grid gap-4">
            <div className="grid sm:grid-cols-5 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-sm mb-1">キーワード</label>
                <input
                  className="w-full bg-transparent border border-white/10 rounded-md p-2"
                  placeholder="問題文やIDで検索"
                  value={questionSearchInput}
                  onChange={(e) => setQuestionSearchInput(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">カテゴリー</label>
                <Select
                  value={questionCategory}
                  onChange={setQuestionCategory}
                  options={categoryOptions}
                  disabled={categoryLoading}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">難易度</label>
                <Select
                  value={questionDifficulty}
                  onChange={setQuestionDifficulty}
                  options={difficultyOptions}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1" onClick={applyQuestionFilter}>
                  検索
                </button>
                <button className="btn btn-ghost flex-1" onClick={resetQuestionFilter}>
                  リセット
                </button>
              </div>
            </div>
            {questionError && (
              <div className="text-sm text-red-400">{questionError}</div>
            )}
            {questionInfo && !questionError && (
              <div className="text-sm text-green-400">{questionInfo}</div>
            )}
          </div>

          <div className="card p-4 grid gap-4">
            {questionLoading ? (
              <div className="text-white/70">読み込み中...</div>
            ) : questionItems.length === 0 ? (
              <div className="text-white/70">該当する問題が見つかりませんでした。</div>
            ) : (
              <div className="grid gap-4">
                {questionItems.map((q) => (
                  <div key={q.id} className="border border-white/10 rounded-md p-4 bg-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
                      <div className="flex flex-wrap gap-3">
                        <span># {q.id}</span>
                        <span>{formatDate(q.created_at)}</span>
                      </div>
                      <div className="flex gap-2">
                        {editingQuestionId === q.id ? (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={cancelQuestionEdit}
                            disabled={editSaving}
                          >
                            編集を閉じる
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline btn-xs"
                            onClick={() => beginQuestionEdit(q)}
                          >
                            編集
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-white/70">
                      カテゴリー: <span className="font-mono">{q.category}</span>{" "}
                      / 難易度: <span className="font-mono">{q.difficulty}</span>{" "}
                      / ソース: <span className="font-mono">{q.source}</span>{" "}
                      / サブジャンル:{" "}
                      <span className="font-mono">
                        {q.subgenre ?? "-"}
                      </span>
                    </div>
                    <div className="mt-3 font-semibold whitespace-pre-wrap leading-6">
                      {q.prompt}
                    </div>
                    <ul className="mt-3 grid gap-1 text-sm">
                      {q.choices.map((choice, idx) => {
                        const isCorrect = q.answerIndex === idx;
                        return (
                          <li
                            key={idx}
                            className={`flex gap-2 ${isCorrect ? "text-green-400" : "text-white/80"}`}
                          >
                            <span className="font-mono">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span>{choice}</span>
                            {isCorrect && (
                              <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-sm">
                                正解
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {q.explanation && (
                      <div className="mt-3 text-sm text-white/75">
                        解説: {q.explanation}
                      </div>
                    )}
                    {editingQuestionId === q.id && editForm && (
                      <div className="mt-4 border-t border-white/10 pt-4 grid gap-4">
                        <div className="grid gap-2">
                          <label className="text-sm">問題文</label>
                          <textarea
                            className="w-full min-h-[120px] bg-transparent border border-white/10 rounded-md p-2"
                            value={editForm.prompt}
                            onChange={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, prompt: e.target.value } : prev
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm">選択肢と正解</label>
                          <div className="grid gap-2">
                            {editForm.choices.map((choice, idx) => (
                              <div
                                key={idx}
                                className="flex flex-wrap items-center gap-3"
                              >
                                <span className="font-mono text-sm w-6">
                                  {String.fromCharCode(65 + idx)}.
                                </span>
                                <input
                                  className="flex-1 min-w-[200px] bg-transparent border border-white/10 rounded-md p-2"
                                  value={choice}
                                  onChange={(e) =>
                                    updateChoiceValue(idx, e.target.value)
                                  }
                                />
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="radio"
                                    name={`answer-${q.id}`}
                                    checked={editForm.answerIndex === idx}
                                    onChange={() =>
                                      setEditForm((prev) =>
                                        prev
                                          ? { ...prev, answerIndex: idx }
                                          : prev
                                      )
                                    }
                                  />
                                  <span>正解</span>
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <label className="text-sm">カテゴリー</label>
                            <Select
                              value={editForm.category}
                              onChange={(value) =>
                                setEditForm((prev) =>
                                  prev ? { ...prev, category: value } : prev
                                )
                              }
                              options={effectiveCategoryOptions}
                              placeholder="カテゴリーを選択"
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-sm">難易度</label>
                            <Select
                              value={editForm.difficulty}
                              onChange={(value) =>
                                setEditForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        difficulty: value as
                                          | "easy"
                                          | "normal"
                                          | "hard",
                                      }
                                    : prev
                                )
                              }
                              options={[
                                { value: "easy", label: "easy" },
                                { value: "normal", label: "normal" },
                                { value: "hard", label: "hard" },
                              ]}
                            />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="grid gap-2">
                            <label className="text-sm">サブジャンル</label>
                            <input
                              className="w-full bg-transparent border border-white/10 rounded-md p-2"
                              value={editForm.subgenre}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev ? { ...prev, subgenre: e.target.value } : prev
                                )
                              }
                              placeholder="任意"
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-sm">ソース</label>
                            <input
                              className="w-full bg-transparent border border-white/10 rounded-md p-2"
                              value={editForm.source}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev ? { ...prev, source: e.target.value } : prev
                                )
                              }
                              placeholder="任意 (例: static, gpt)"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-sm">解説</label>
                          <textarea
                            className="w-full min-h-[80px] bg-transparent border border-white/10 rounded-md p-2"
                            value={editForm.explanation}
                            onChange={(e) =>
                              setEditForm((prev) =>
                                prev
                                  ? { ...prev, explanation: e.target.value }
                                  : prev
                              )
                            }
                            placeholder="任意"
                          />
                        </div>
                        {editError && (
                          <div className="text-sm text-red-400">{editError}</div>
                        )}
                        <div className="flex flex-wrap justify-between gap-2">
                          <button
                            className="btn btn-outline btn-sm border-red-500/60 text-red-300 hover:bg-red-500/10"
                            onClick={() => deleteQuestion(q.id)}
                            disabled={
                              deleteProcessingId === q.id || editSaving
                            }
                            type="button"
                          >
                            {deleteProcessingId === q.id ? "削除中..." : "削除"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={cancelQuestionEdit}
                            disabled={editSaving || deleteProcessingId === q.id}
                          >
                            キャンセル
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => saveQuestionEdit(q.id)}
                            disabled={
                              editSaving || deleteProcessingId === q.id
                            }
                          >
                            {editSaving ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
              <div>
                総件数: {questionTotal} / ページ {questionPage}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQuestionPage((prev) => Math.max(1, prev - 1))}
                  disabled={questionPage === 1 || questionLoading}
                >
                  前へ
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQuestionPage((prev) => prev + 1)}
                  disabled={!questionHasMore || questionLoading}
                >
                  次へ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div className="grid gap-4">
          <div className="card p-4 grid gap-4">
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-sm mb-1">キーワード</label>
                <input
                  className="w-full bg-transparent border border-white/10 rounded-md p-2"
                  placeholder="問題文やIDで検索"
                  value={reportSearchInput}
                  onChange={(e) => setReportSearchInput(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">モード</label>
                <Select
                  value={reportMode}
                  onChange={(value) =>
                    setReportMode(value as "all" | "single" | "versus")
                  }
                  options={[
                    { value: "all", label: "すべて" },
                    { value: "single", label: "一人プレイ" },
                    { value: "versus", label: "対戦" },
                  ]}
                />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1" onClick={applyReportFilter}>
                  検索
                </button>
                <button className="btn btn-ghost flex-1" onClick={resetReportFilter}>
                  リセット
                </button>
              </div>
            </div>
            {reportError && (
              <div className="text-sm text-red-400">{reportError}</div>
            )}
          </div>

          <div className="card p-4 grid gap-4">
            {reportLoading ? (
              <div className="text-white/70">読み込み中...</div>
            ) : reportItems.length === 0 ? (
              <div className="text-white/70">
                該当する修正依頼が見つかりませんでした。
              </div>
            ) : (
              <div className="grid gap-4">
                {reportItems.map((item) => (
                  <div key={item.id} className="border border-white/10 rounded-md p-4 bg-white/5">
                    <div className="flex flex-wrap gap-3 justify-between text-sm text-white/60">
                      <div>報告ID: {item.id}</div>
                      <div>{formatDate(item.created_at)}</div>
                    </div>
                    <div className="mt-2 text-sm text-white/70">
                      モード:{" "}
                      <span className="font-mono">
                        {item.mode === "single" ? "一人プレイ" : "対戦"}
                      </span>{" "}
                      / 質問ID:{" "}
                      <span className="font-mono">{item.questionId ?? "-"}</span>{" "}
                      / カテゴリー:{" "}
                      <span className="font-mono">{item.category ?? "-"}</span>
                    </div>
                    <div className="mt-3 font-semibold whitespace-pre-wrap leading-6">
                      {item.prompt}
                    </div>
                    <ul className="mt-3 grid gap-1 text-sm">
                      {item.choices.map((choice, idx) => {
                        const isCorrect = item.answerIndex === idx;
                        return (
                          <li
                            key={idx}
                            className={`flex gap-2 ${isCorrect ? "text-green-400" : "text-white/80"}`}
                          >
                            <span className="font-mono">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span>{choice}</span>
                            {isCorrect && (
                              <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-sm">
                                正解
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {item.explanation && (
                      <div className="mt-3 text-sm text-white/75">
                        解説: {item.explanation}
                      </div>
                    )}
                    {item.context && typeof item.context === "object" && (
                      <div className="mt-3 text-xs text-white/70 grid gap-1">
                        {Object.entries(item.context).map(([key, value]) => (
                          <div key={key}>
                            {key}: {JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.questionId && (
                      <div className="mt-4 flex justify-end">
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={() => openQuestionFromReport(item.questionId)}
                        >
                          該当の問題を編集
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
              <div>
                総件数: {reportTotal} / ページ {reportPage}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReportPage((prev) => Math.max(1, prev - 1))}
                  disabled={reportPage === 1 || reportLoading}
                >
                  前へ
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReportPage((prev) => prev + 1)}
                  disabled={!reportHasMore || reportLoading}
                >
                  次へ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
