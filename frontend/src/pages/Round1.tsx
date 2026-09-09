import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  isLoggedIn,
  startTeamRound1 as startRound1,
  submitTeamRound1 as submitRound1,
  fetchTeamRound1Result as fetchRound1Result,
  type Round1Question,
  type Round1SubmitResult,
} from "../lib/api";
import Fingerprint from "../components/Fingerprint";

function formatTime(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Round1() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<Round1Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<Round1SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const answersRef = useRef<Record<string, string>>({});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }

    fetchRound1Result()
      .then((res) => {
        if (res.submitted) {
          submittedRef.current = true;
          setResult(res);
          setLoading(false);
          return;
        }
        return startRound1().then((data) => {
          if (data.already_submitted) {
            // Rare race: submitted between the two calls above.
            return fetchRound1Result().then((r) => {
              if (r.submitted) setResult(r);
            });
          }
          setQuestions(data.questions || []);
          setExpiresAt(data.timer?.expires_at || null);
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function handleSubmit() {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitRound1(answersRef.current);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  // Countdown, driven by the server's expires_at — auto-submits at zero.
  useEffect(() => {
    if (!expiresAt || result) return;
    const tick = () => {
      const remaining = (new Date(expiresAt).getTime() - Date.now()) / 1000;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        handleSubmit();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, result]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-board">
        <p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Loading Round 1…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center">
        <p className="text-sm text-red">{error}</p>
        <Link to="/competition" className="mono-tag text-xs uppercase tracking-widest text-cyan hover:underline">
          Back to Competition
        </Link>
      </div>
    );
  }

  // --- Result view ---------------------------------------------------------
  if (result) {
    return (
      <div className="min-h-screen bg-board px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Fingerprint className="mx-auto mb-4 h-12 w-12 text-green" />
          <div className="text-center">
            <p className="mono-tag text-xs uppercase tracking-[0.4em] text-green">
              Round 1 Submitted
            </p>
            <h1 className="mt-3 font-display text-3xl text-ivory">
              Score: {result.score} / {result.total}
            </h1>
            <p className="mt-2 text-sm text-paper/70">
              {result.eligible
                ? "Your team has been qualified by the administrator for Round 2!"
                : "Your answers have been recorded. Please wait for the administrator to review your score and qualify your team for Round 2."}
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {result.results.map((r, i) => (
              <div
                key={r.id}
                className={`rounded-md border p-4 ${r.is_correct ? "border-green/40 bg-green/5" : "border-red/40 bg-red/5"}`}
              >
                <p className="text-sm text-ivory">
                  {i + 1}. {r.question}
                </p>
                <p className="mono-tag mt-2 text-xs">
                  Your answer: <span className={r.is_correct ? "text-green" : "text-red"}>{r.your_answer ?? "(none)"}</span>
                  {!r.is_correct && (
                    <span className="ml-3 text-paper/60">Correct: <span className="text-green">{r.correct_answer}</span></span>
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/competition"
              className="mono-tag rounded-md border border-cyan px-8 py-3 text-sm uppercase tracking-widest text-cyan hover:bg-cyan/10"
            >
              Back to Competition
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Quiz view -------------------------------------------------------------
  const answeredCount = Object.keys(answers).length;
  const timeCritical = secondsLeft !== null && secondsLeft <= 60;

  return (
    <div className="min-h-screen bg-board px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="mono-tag text-xs uppercase tracking-widest text-green">Round 1 — Quiz</p>
            <p className="mt-1 text-sm text-paper/60">{answeredCount} / {questions.length} answered</p>
          </div>
          <div
            className={`mono-tag rounded-md border px-4 py-2 text-lg ${timeCritical ? "border-red text-red animate-pulse" : "border-line text-ivory"}`}
          >
            {secondsLeft !== null ? formatTime(secondsLeft) : "--:--"}
          </div>
        </div>

        <div className="space-y-5">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-line bg-panel/90 p-5 shadow-card">
              <p className="mb-3 font-display text-base text-ivory">
                {i + 1}. {q.question}
              </p>
              <div className="grid gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                    className={`rounded-md border px-4 py-2.5 text-left text-sm transition ${
                      answers[q.id] === opt.id
                        ? "border-cyan bg-cyan/10 text-cyan"
                        : "border-line text-ivory/90 hover:border-cyan/50 hover:bg-cyan/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="mono-tag rounded-md border border-green bg-green/10 px-10 py-3.5 text-sm uppercase tracking-widest text-green shadow-glowGreen transition hover:bg-green hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Answers"}
          </button>
        </div>
      </div>
    </div>
  );
}
