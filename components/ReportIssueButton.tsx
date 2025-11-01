"use client";

import { useState } from "react";

type ReportMode = "single" | "versus";

type ReportQuestion = {
  id?: string | number | null;
  prompt: string;
  choices: string[];
  answerIndex?: number | null;
  explanation?: string | null;
  category?: string | null;
};

type ReportContext = Record<string, unknown> | undefined;

type Props = {
  question: ReportQuestion;
  mode: ReportMode;
  context?: ReportContext;
  className?: string;
};

export function ReportIssueButton({
  question,
  mode,
  context,
  className,
}: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    if (status === "sending" || status === "done") return;
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/questions/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          question: {
            ...question,
            choices: [...question.choices],
          },
          context,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setStatus("done");
      setMessage("送信しました。ご協力ありがとうございます。");
    } catch (e) {
      setStatus("error");
      setMessage(
        (e as Error).message || "送信に失敗しました。時間をおいて再度お試しください。"
      );
    }
  }

  return (
    <div className={className ?? "mt-3"}>
      <button
        className={`btn btn-xs border-none bg-amber-500 text-black hover:bg-amber-400 ${
          status === "sending" || status === "done" ? "opacity-70 cursor-not-allowed" : ""
        }`}
        onClick={handleClick}
        disabled={status === "sending" || status === "done"}
      >
        問題の修正を依頼
      </button>
      {message && (
        <div
          className={`mt-1 text-xs ${
            status === "error" ? "text-red-400" : "text-white/70"
          }`}
        >
          {message}
        </div>
      )}
      {status === "done" && !message && (
        <div className="mt-1 text-xs text-white/70">
          ご協力ありがとうございます。
        </div>
      )}
    </div>
  );
}
