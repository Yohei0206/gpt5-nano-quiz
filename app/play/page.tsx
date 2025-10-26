"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/store";
import { QuestionCard } from "@/components/QuestionCard";

function PlayInner() {
  const router = useRouter();
  const { questions, answers, setAnswer } = useQuiz();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (questions.length === 0) {
      router.replace("/");
    }
  }, [questions.length, router]);

  const progress = useMemo(() => {
    if (questions.length === 0) return 0;
    const answered = answers.filter((a) => a >= 0).length;
    return Math.round((answered / questions.length) * 100);
  }, [answers, questions.length]);

  if (questions.length === 0) return null;
  const q = questions[idx];
  const selected = answers[idx] >= 0 ? answers[idx] : null;

  function next() {
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else router.push("/result");
  }

  return (
    <div className="space-y-6">
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
      </div>

      <QuestionCard
        q={q}
        index={idx}
        total={questions.length}
        selected={selected}
        onSelect={(i) => { setAnswer(idx, i); setTimeout(next, 250); }}
      />

      <div className="text-right text-sm text-white/60">選択すると次へ進みます</div>
    </div>
  );
}

export default function PlayPage() { return <PlayInner />; }

