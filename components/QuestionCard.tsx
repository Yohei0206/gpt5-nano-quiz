"use client";
import { useMemo } from "react";
import type { Question } from "@/lib/types";

export function QuestionCard({
  q,
  index,
  total,
  selected,
  onSelect,
}: {
  q: Question;
  index: number;
  total: number;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const letters = useMemo(() => ["A", "B", "C", "D"], []);

  return (
    <div className="card p-6">
      <div className="text-sm text-white/70 mb-2">
        Q{index + 1}/{total} ・ {q.category} ・ {q.difficulty}
      </div>
      <h2 className="text-xl font-semibold mb-4">{q.prompt}</h2>
      <div className="grid gap-3">
        {q.choices.map((c, i) => {
          const active = selected === i;
          return (
            <button
              key={i}
              className={`btn text-left border border-white/10 ${
                active ? "bg-blue-600" : "btn-ghost"
              }`}
              onClick={() => onSelect(i)}
            >
              <span className="mr-2 opacity-70">{letters[i]}.</span>
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

