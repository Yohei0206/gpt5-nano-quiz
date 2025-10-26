"use client";
import { createContext, useContext, useMemo, useState } from "react";
import type { Question } from "./types";

type State = {
  questions: Question[];
  setQuestions: (q: Question[]) => void;
  answers: number[]; // selected index per question; -1 for unanswered
  setAnswer: (idx: number, choice: number) => void;
  reset: () => void;
};

const Ctx = createContext<State | null>(null);

export function QuizProvider({ children }: { children: React.ReactNode }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);

  const api = useMemo<State>(() => ({
    questions,
    setQuestions: (q) => {
      setQuestions(q);
      setAnswers(Array.from({ length: q.length }, () => -1));
    },
    answers,
    setAnswer: (idx, choice) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[idx] = choice;
        return next;
      });
    },
    reset: () => {
      setQuestions([]);
      setAnswers([]);
    },
  }), [questions, answers]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useQuiz() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuiz must be used inside QuizProvider");
  return v;
}

