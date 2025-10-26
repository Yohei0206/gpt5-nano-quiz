"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
// Default avatar for players without image
import defaultAvatar from "@/app/public/quiz_man_hatena.png";
import Select from "@/components/Select";
// MP3はpublicからパス指定で再生（importしない）
import { CATEGORIES } from "@/lib/buzzer/constants";
import type { VsState } from "@/lib/buzzer/types";
import { unlockAudioElements } from "@/lib/buzzer/audio";

export default function VersusPage() {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [category, setCategory] = useState("trivia");
  const [difficulty, setDifficulty] = useState("normal");
  const [questionCount, setQuestionCount] = useState(6);
  const [hostName, setHostName] = useState("ホスト");
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");

  const [matchId, setMatchId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<VsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<null | "correct" | "wrong">(null);
  const [feedbackPlayerId, setFeedbackPlayerId] = useState<string | null>(null);
  // Use refs to avoid stale closures during polling
  const lastAnswerKeyRef = useRef<string | null>(null);
  const feedbackRef = useRef<null | "correct" | "wrong">(null);
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  async function createRoom() {
    setError(null);
    setBusy(true);
    try {
      ensureAudioUnlocked();
      const r = await fetch("/api/buzzer/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, difficulty, questionCount, hostName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMatchId(j.matchId);
      setToken(j.hostToken);
      setPlayerId(j.hostPlayerId || null);
      setJoinCode(j.joinCode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setError(null);
    setBusy(true);
    try {
      ensureAudioUnlocked();
      const r = await fetch("/api/buzzer/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode, name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMatchId(j.matchId);
      setToken(j.token);
      setPlayerId(j.playerId || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!matchId || !token) return;
    ensureAudioUnlocked();
    try {
      startAudioRef.current?.play().catch(() => {});
      startAudioPlayedAtRef.current = Date.now();
      typeBlockUntilRef.current = Date.now() + 200;
    } catch {}
    const r = await fetch("/api/buzzer/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId, token }),
    });
    const j = await r.json();
    if (!r.ok) setError(j?.error || `HTTP ${r.status}`);
  }

  async function answer(i: number) {
    if (!matchId || !token) return;
    ensureAudioUnlocked();
    const r = await fetch("/api/buzzer/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId, token, answerIndex: i }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j?.error || `HTTP ${r.status}`);
      return;
    }
    // Do not set local-only feedback. Fetch state once to trigger global feedback immediately
    try {
      const rs = await fetch(`/api/buzzer/state?matchId=${matchId}`);
      const sj = await rs.json();
      if (rs.ok && sj?.lastAnswer) {
        const key = `${sj.lastAnswer.index ?? "na"}|${
          sj.lastAnswer.created_at ?? ""
        }|${sj.lastAnswer.player_id ?? ""}`;
        if (lastAnswerKeyRef.current !== key && !feedbackRef.current) {
          lastAnswerKeyRef.current = key;
          setFeedback(sj.lastAnswer.correct ? "correct" : "wrong");
          setFeedbackPlayerId(sj.lastAnswer.player_id || null);
          try {
            if (sj.lastAnswer.correct)
              maruAudioRef.current?.play().catch(() => {});
            else batuAudioRef.current?.play().catch(() => {});
          } catch {}
          setTimeout(() => setFeedback(null), 1200);
        }
      }
    } catch {}
  }

  useEffect(() => {
    let t: number | undefined;
    async function poll() {
      if (!matchId) return;
      try {
        const r = await fetch(`/api/buzzer/state?matchId=${matchId}`);
        const j = await r.json();
        if (r.ok) {
          setState(j);
          // Show unified feedback to everyone if a recent answer exists
          if (j?.lastAnswer && !feedbackRef.current) {
            const key = `${j.lastAnswer.index ?? "na"}|${
              j.lastAnswer.created_at ?? ""
            }|${j.lastAnswer.player_id ?? ""}`;
            if (lastAnswerKeyRef.current !== key) {
              lastAnswerKeyRef.current = key;
              setFeedback(j.lastAnswer.correct ? "correct" : "wrong");
              setFeedbackPlayerId(j.lastAnswer.player_id || null);
              try {
                if (j.lastAnswer.correct)
                  maruAudioRef.current?.play().catch(() => {});
                else batuAudioRef.current?.play().catch(() => {});
              } catch {}
              setTimeout(() => setFeedback(null), 1200);
            }
          }
        }
      } catch {}
      t = window.setTimeout(poll, 1000);
    }
    poll();
    return () => {
      if (t != null) window.clearTimeout(t);
    };
  }, [matchId]);

  // reset seen key when match changes explicitly
  useEffect(() => {
    lastAnswerKeyRef.current = null;
  }, [matchId]);

  const canStart = !!matchId && !!token && state?.match?.state === "waiting";
  const lockedBy = state?.match?.locked_by ?? undefined;
  const canAnswer =
    !!matchId &&
    !!playerId &&
    state?.match?.state === "in_progress" &&
    (!lockedBy || lockedBy === playerId);
  const someoneAnswering =
    !!lockedBy && lockedBy !== playerId && state?.match?.state === "in_progress";
  const finished = state?.match?.state === "finished";

  // Typewriter for question prompt (0.15s per character)
  const [typedPrompt, setTypedPrompt] = useState<string>("");
  const qKeyRef = useRef<string | null>(null);
  const typerTimerRef = useRef<number | null>(null);
  const typerDelayRef = useRef<number | null>(null);
  const typeBlockUntilRef = useRef<number>(0);
  const prevMatchStateRef = useRef<string | null>(null);
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const maruAudioRef = useRef<HTMLAudioElement | null>(null);
  const batuAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioReadyRef = useRef<boolean>(false);
  const startAudioPlayedAtRef = useRef<number>(0);
  useEffect(() => {
    // Clear on unmount
    return () => {
      if (typerTimerRef.current != null) window.clearInterval(typerTimerRef.current);
      if (typerDelayRef.current != null) window.clearTimeout(typerDelayRef.current);
    };
  }, []);
  // Init audio elements once
  useEffect(() => {
    try {
      startAudioRef.current = new Audio("/start.mp3");
      maruAudioRef.current = new Audio("/maru.mp3");
      batuAudioRef.current = new Audio("/batu.mp3");
      [
        startAudioRef.current,
        maruAudioRef.current,
        batuAudioRef.current,
      ].forEach((a) => {
        if (a) {
          a.preload = "auto";
          a.volume = 0.9;
        }
      });
    } catch {}
  }, []);

  function ensureAudioUnlocked() {
    if (audioReadyRef.current) return;
    unlockAudioElements([
      startAudioRef.current,
      maruAudioRef.current,
      batuAudioRef.current,
    ]);
    audioReadyRef.current = true;
  }
  // Detect start transition -> play SE and delay typing by 200ms
  useEffect(() => {
    const cur = state?.match?.state || null;
    const prev = prevMatchStateRef.current;
    if (prev !== "in_progress" && cur === "in_progress") {
      typeBlockUntilRef.current = Date.now() + 200;
      if (Date.now() - startAudioPlayedAtRef.current > 800) {
        try {
          startAudioRef.current?.play().catch(() => {});
        } catch {}
      }
    }
    prevMatchStateRef.current = cur;
  }, [state?.match?.state]);
  useEffect(() => {
    // When a new question appears (or index changes), start typing
    if (!state?.question || finished) {
      if (typerTimerRef.current != null) window.clearInterval(typerTimerRef.current);
      typerTimerRef.current = null;
      setTypedPrompt("");
      return;
    }
    const key = `${state.match?.id || ""}|${
      state.match?.current_index ?? "na"
    }|${state.question?.id || ""}`;
    if (qKeyRef.current === key) return; // same question, keep current typing
    qKeyRef.current = key;
    if (typerTimerRef.current != null) window.clearInterval(typerTimerRef.current);
    if (typerDelayRef.current != null) window.clearTimeout(typerDelayRef.current);
    const full = (state.question.prompt || "").toString();
    setTypedPrompt("");
    let idx = 0;
    const begin = () => {
      typerTimerRef.current = window.setInterval(() => {
        idx += 1;
        setTypedPrompt(full.slice(0, idx));
        if (idx >= full.length) {
          if (typerTimerRef.current != null) window.clearInterval(typerTimerRef.current);
          typerTimerRef.current = null;
        }
      }, 150);
    };
    const wait = Math.max(0, typeBlockUntilRef.current - Date.now());
    if (wait > 0) {
      typerDelayRef.current = window.setTimeout(begin, wait);
    } else {
      begin();
    }
  }, [state?.question, state?.match?.current_index, finished]);

  function resetRoom() {
    setMatchId(null);
    setToken(null);
    setPlayerId(null);
    setState(null);
    setError(null);
    lastAnswerKeyRef.current = null;
    setFeedback(null);
  }

  return (
    <div className="container mx-auto p-4 grid gap-4">
      <h1 className="text-xl font-bold">対戦モード</h1>

      {!matchId && (
        <div className="card p-5 grid gap-5">
          {tab === "create" ? (
            <div className="grid gap-3">
              <div>
                <div className="text-lg font-semibold">ルームを作成</div>
                <div className="text-sm text-white/60">
                  カテゴリ・難易度・問題数を選んでホスト名を設定します。
                </div>
              </div>
              <div className="grid sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-sm">カテゴリー</label>
                  <Select
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES.map((c) => ({
                      value: c.slug,
                      label: c.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="text-sm">難易度</label>
                  <Select
                    value={difficulty}
                    onChange={(v) => setDifficulty(v)}
                    options={[
                      { value: "easy", label: "easy" },
                      { value: "normal", label: "normal" },
                      { value: "hard", label: "hard" },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm">問題数</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="w-full bg-transparent border border-white/10 rounded-md p-2"
                    value={questionCount}
                    onChange={(e) =>
                      setQuestionCount(
                        Math.max(1, Math.min(20, Number(e.target.value) || 6))
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-sm">ホスト名</label>
                  <input
                    className="w-full bg-transparent border border-white/10 rounded-md p-2"
                    placeholder="ホスト"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <div>
                <div className="text-lg font-semibold">ルームに参加</div>
                <div className="text-sm text-white/60">
                  ホストから共有された参加コードと名前を入力してください。
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm">参加コード</label>
                  <input
                    className="w-full bg-transparent border border-white/10 rounded-md p-2"
                    placeholder="例: 9UYNVD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className="text-sm">名前</label>
                  <input
                    className="w-full bg-transparent border border-white/10 rounded-md p-2"
                    placeholder="あなたの名前"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {tab === "create" ? (
              <>
                <button className="btn" onClick={() => setTab("join")}>
                  参加
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createRoom}
                  disabled={busy || hostName.trim().length === 0}
                >
                  {busy ? "作成中..." : "ルームを作成"}
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => setTab("create")}>
                  戻る
                </button>
                <button
                  className="btn btn-primary"
                  onClick={joinRoom}
                  disabled={
                    busy ||
                    joinCode.trim().length === 0 ||
                    name.trim().length === 0
                  }
                >
                  {busy ? "参加中..." : "参加"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {matchId && !finished && (
        <div className="card p-4 grid gap-3">
          {state?.match?.state === "waiting" && (
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-white/60">matchId: {matchId}</div>
                {joinCode && (
                  <div className="text-sm">
                    参加コード:{" "}
                    <span className="font-mono text-lg">{joinCode}</span>
                  </div>
                )}
              </div>
              <div>
                {canStart && (
                  <button className="btn btn-success" onClick={start}>
                    開始
                  </button>
                )}
              </div>
            </div>
          )}
          {state?.question && (
            <div className="grid gap-2">
              <div className="font-semibold whitespace-pre-wrap leading-6 min-h-[4.5rem]">
                {typedPrompt}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {state.question.choices.map((c, i) => (
                  <button
                    key={i}
                    className="btn btn-ghost justify-start"
                    disabled={!canAnswer || !!feedback || busy}
                    onClick={() => answer(i)}
                  >
                    {String.fromCharCode(65 + i)}. {c}
                  </button>
                ))}
              </div>
              {!canAnswer && someoneAnswering && (
                <div className="text-sm text-white/70">
                  他のプレイヤーが回答中です…
                </div>
              )}
            </div>
          )}
          {/* Center overlay removed; feedback is shown on the answering player's avatar */}

          {/* Players avatar strip */}
          <div className="mt-4">
            <div className="flex items-start gap-4 overflow-x-auto pb-2">
              {(state?.players ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col items-center w-28 shrink-0"
                >
                  <div
                    className={`relative w-24 h-24 rounded-md overflow-hidden border ${
                      p.is_host ? "border-yellow-400/50" : "border-white/10"
                    } bg-white/5`}
                  >
                    <Image
                      src={defaultAvatar}
                      alt={p.name || "player"}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                    {feedback && feedbackPlayerId === p.id && (
                      <div
                        className={`absolute top-1 right-1 w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                          feedback === "correct"
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {feedback === "correct" ? "◯" : "☓"}
                      </div>
                    )}
                  </div>
                  <div className="text-sm mt-2 truncate max-w-[96px] text-center">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-white/60">
                    {p.score ?? 0} 点
                  </div>
                </div>
              ))}
            </div>
          </div>
          {error && <div className="text-red-400">{error}</div>}
        </div>
      )}

      {matchId && finished && (
        <div className="card p-6 grid gap-4 text-center">
          <h2 className="text-2xl font-bold">対戦終了</h2>
          <div className="text-white/70">お疲れさまでした！最終結果</div>
          <div className="grid gap-2 text-left">
            {[...(state?.players ?? [])]
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map((p, i: number) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-md border ${
                    i === 0
                      ? "bg-yellow-500/10 border-yellow-400/40"
                      : "border-white/10"
                  }`}
                >
                  <div className="font-medium">
                    {i + 1}位: {p.name}
                    {p.is_host ? " [HOST]" : ""}
                  </div>
                  <div className="font-mono">{p.score} 点</div>
                </div>
              ))}
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <button className="btn" onClick={resetRoom}>
              もう一度対戦
            </button>
            <a className="btn btn-ghost" href="/">
              トップへ
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
