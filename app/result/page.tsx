"use client";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/store";
import { ReportIssueButton } from "@/components/ReportIssueButton";

function ResultInner() {
  const router = useRouter();
  const { questions, answers, reset } = useQuiz();

  useEffect(() => {
    if (questions.length === 0) router.replace("/");
  }, [questions.length, router]);

  const score = useMemo(() => {
    let s = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.answerIndex) s += 1;
    });
    return s;
  }, [questions, answers]);

  if (questions.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">結果</h1>
        <p className="text-white/70">
          正答: {score} / {questions.length}（{Math.round((score / questions.length) * 100)}%）
        </p>
      </div>

      <div className="grid gap-4">
        {questions.map((q, i) => {
          const correct = answers[i] === q.answerIndex;
          return (
            <div key={q.id} className="card p-4">
              <div className="mb-2 text-sm text-white/60">Q{i + 1} ・ {q.category}</div>
              <div className="font-semibold mb-2">{q.prompt}</div>
              <div className="text-sm">
                あなたの回答: <span className={correct ? "text-green-400" : "text-red-400"}>
                  {q.choices[answers[i]] ?? "未回答"}
                </span>
                <span className="mx-2">/</span>
                正解: <span className="text-green-400">{q.choices[q.answerIndex]}</span>
              </div>
              {q.explanation && (
                <div className="mt-2 text-white/80 text-sm">解説: {q.explanation}</div>
              )}
              <ReportIssueButton
                className="mt-3"
                mode="single"
                question={{
                  id: q.id,
                  prompt: q.prompt,
                  choices: [...q.choices],
                  answerIndex: q.answerIndex,
                  explanation: q.explanation ?? null,
                  category: q.category,
                }}
                context={{
                  questionIndex: i,
                  userAnswer: answers[i],
                  correctAnswer: q.answerIndex,
                  correct: answers[i] === q.answerIndex,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <button
          className="btn btn-success"
          onClick={() => {
            reset();
            router.push("/");
          }}
        >
          もう一度
        </button>
      </div>
    </div>
  );
}

export default function ResultPage() { return <ResultInner />; }
