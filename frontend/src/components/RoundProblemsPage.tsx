import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  isLoggedIn,
  startTeamRound,
  runTeamRound2Code,
  submitTeamRound2Code,
  type CodeExecutionResult,
  type CodeSubmissionResult,
  type ExecutionLanguage,
  type RoundSubmissionEntry,
} from "../lib/api";
import type { StaticProblem } from "../types";

function formatTime(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const accentClasses = {
  cyan: { text: "text-cyan", border: "border-cyan", bg: "bg-cyan/10", glow: "shadow-glowCyan" },
  red: { text: "text-red", border: "border-red", bg: "bg-red/10", glow: "shadow-glowRed" },
} as const;

const resultBadge: Record<string, string> = {
  correct: "border-green/50 bg-green/10 text-green",
  incorrect: "border-red/50 bg-red/10 text-red",
  pending: "border-line text-paper/50",
};

interface RoundProblemsPageProps {
  roundNumber: 2;
  title: string;
  accent: "cyan" | "red";
}

export default function RoundProblemsPage({ roundNumber, title, accent }: RoundProblemsPageProps) {
  const navigate = useNavigate();
  const a = accentClasses[accent];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<StaticProblem[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Keyed by 1-based position in the team's assigned list (matches backend's
  // `problem_number`) — NOT the pool item's database id.
  const [submissions, setSubmissions] = useState<Record<number, RoundSubmissionEntry>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [savingProblem, setSavingProblem] = useState<number | null>(null);
  const [languages, setLanguages] = useState<Record<number, ExecutionLanguage>>({});
  const [sourceCode, setSourceCode] = useState<Record<number, string>>({});
  const [customInput, setCustomInput] = useState<Record<number, string>>({});
  const [runResults, setRunResults] = useState<Record<number, CodeExecutionResult | null>>({});
  const [submitResults, setSubmitResults] = useState<Record<number, CodeSubmissionResult | null>>({});
  const [runningProblem, setRunningProblem] = useState<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }
    startTeamRound(roundNumber)
      .then((data) => {
        setProblems(data.problems);
        setExpiresAt(data.timer.expires_at);
        expiredRef.current = data.timer.is_expired;
        const byProblem: Record<number, RoundSubmissionEntry> = {};
        data.submissions.forEach((s) => {
          byProblem[s.problem_number] = s;
        });
        setSubmissions(byProblem);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, roundNumber]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = (new Date(expiresAt).getTime() - Date.now()) / 1000;
      setSecondsLeft(remaining);
      if (remaining <= 0) expiredRef.current = true;
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleRun(problemNumber: number) {
    if (expiredRef.current) return;
    setRunningProblem(problemNumber);
    setError("");
    try {
      const result = await runTeamRound2Code(
        problemNumber,
        languages[problemNumber] ?? "python",
        sourceCode[problemNumber] ?? "",
        customInput[problemNumber] ?? ""
      );
      setRunResults((prev) => ({ ...prev, [problemNumber]: result }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningProblem(null);
    }
  }

  async function handleCodeSubmit(problemNumber: number) {
    if (expiredRef.current) return;
    setSavingProblem(problemNumber);
    setError("");
    try {
      const result = await submitTeamRound2Code(
        problemNumber,
        languages[problemNumber] ?? "python",
        sourceCode[problemNumber] ?? ""
      );
      setSubmitResults((prev) => ({ ...prev, [problemNumber]: result }));
      setSubmissions((prev) => ({ ...prev, [problemNumber]: result.submission }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingProblem(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-board">
        <p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Loading {title}…</p>
      </div>
    );
  }

  if (error && problems.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center">
        <p className="text-sm text-red">{error}</p>
        <Link to="/competition" className="mono-tag text-xs uppercase tracking-widest text-cyan hover:underline">
          Back to Competition
        </Link>
      </div>
    );
  }

  const timeCritical = secondsLeft !== null && secondsLeft <= 120;
  const isExpired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <div className="min-h-screen bg-board px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className={`mono-tag text-xs uppercase tracking-widest ${a.text}`}>{title}</p>
            <p className="mt-1 text-sm text-paper/60">
              Randomly assigned to your team — no compiler here, solve in your own IDE, then record your status below.
            </p>
          </div>
          <div
            className={`mono-tag rounded-md border px-4 py-2 text-lg ${
              isExpired ? "border-red text-red" : timeCritical ? "border-gold text-gold animate-pulse" : "border-line text-ivory"
            }`}
          >
            {secondsLeft !== null ? formatTime(secondsLeft) : "--:--"}
          </div>
        </div>

        {isExpired ? (
          <p className="mb-6 rounded-md border border-red/50 bg-red/10 px-4 py-3 text-center text-sm text-red">
            Time is up for this round. Submissions are locked.
          </p>
        ) : null}

        {error ? <p className="mb-4 text-sm text-red">{error}</p> : null}

        <div className="space-y-6">
          {problems.map((p, index) => {
            const problemNumber = index + 1;
            const sub = submissions[problemNumber];
            const status = sub?.status ?? "not_started";
            const result = sub?.result ?? "pending";
            const language = languages[problemNumber] ?? "python";
            const execution = runResults[problemNumber];
            const codeSubmission = submitResults[problemNumber];

            return (
              <div key={p.id} className="rounded-lg border border-line bg-panel/90 p-5 shadow-card sm:p-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-xl text-ivory">
                    Problem {problemNumber} — {p.title}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="mono-tag rounded border border-line px-2 py-0.5 text-[10px] uppercase text-paper/60">
                      {status.replace("_", " ")}
                    </span>
                    {status === "submitted" && (
                      <span className={`mono-tag rounded border px-2 py-0.5 text-[10px] uppercase ${resultBadge[result]}`}>
                        {result}
                      </span>
                    )}
                  </div>
                </div>

                <p className="mb-3 text-sm leading-relaxed text-paper/85">{p.prompt}</p>

                {p.code ? (
                  <pre className="mono-tag mb-3 overflow-x-auto rounded-md border border-line bg-ink px-4 py-3 text-[13px] leading-relaxed text-red">
                    <code>{p.code}</code>
                  </pre>
                ) : null}

                {p.expectedBehavior ? (
                  <p className="mb-3 rounded-md border-l-2 border-cyan/50 bg-cyan/5 px-3 py-2 text-sm text-cyan/90">
                    Expected: {p.expectedBehavior}
                  </p>
                ) : null}

                <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md border border-line bg-ink/60 p-3">
                    <p className="mono-tag mb-1 text-[10px] uppercase tracking-widest text-gold">Input</p>
                    <p className="text-paper/85">{p.input}</p>
                  </div>
                  <div className="rounded-md border border-line bg-ink/60 p-3">
                    <p className="mono-tag mb-1 text-[10px] uppercase tracking-widest text-gold">Output</p>
                    <p className="text-paper/85">{p.output}</p>
                  </div>
                </div>

                <div className="mb-3 rounded-md border border-line bg-ink/60 p-3 text-sm">
                  <p className="mono-tag mb-1 text-[10px] uppercase tracking-widest text-gold">Constraints</p>
                  <ul className="list-inside list-disc text-paper/85">
                    {p.constraints.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-4 space-y-2">
                  {p.examples.map((ex, i) => (
                    <div key={i} className="mono-tag rounded-md border border-line bg-ink/60 px-3 py-2 text-xs text-paper/80">
                      Input: {ex.input} → Output: {ex.output}
                    </div>
                  ))}
                </div>

                <div className="mb-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                  <label className="text-sm text-paper/80">
                    <span className="mono-tag mb-1 block text-[10px] uppercase tracking-widest text-gold">Language</span>
                    <select
                      value={language}
                      onChange={(e) => setLanguages((prev) => ({ ...prev, [problemNumber]: e.target.value as ExecutionLanguage }))}
                      disabled={isExpired || savingProblem === problemNumber || runningProblem === problemNumber}
                      className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none disabled:opacity-50"
                    >
                      <option value="python">Python</option>
                      <option value="c">C</option>
                      <option value="cpp">C++</option>
                      <option value="java">Java</option>
                    </select>
                  </label>
                  <label className="text-sm text-paper/80">
                    <span className="mono-tag mb-1 block text-[10px] uppercase tracking-widest text-gold">Source Code</span>
                    <textarea
                      value={sourceCode[problemNumber] ?? ""}
                      onChange={(e) => setSourceCode((prev) => ({ ...prev, [problemNumber]: e.target.value }))}
                      placeholder={language === "python" ? "print('your solution')" : "Write your solution here"}
                      rows={10}
                      disabled={isExpired}
                      spellCheck={false}
                      className="mono-tag w-full rounded-md border border-line bg-ink px-3 py-2 text-xs leading-relaxed text-ivory placeholder:text-paper/30 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan disabled:opacity-50"
                    />
                  </label>
                </div>

                <label className="mb-3 block text-sm text-paper/80">
                  <span className="mono-tag mb-1 block text-[10px] uppercase tracking-widest text-gold">Custom Input</span>
                  <textarea
                    value={customInput[problemNumber] ?? ""}
                    onChange={(e) => setCustomInput((prev) => ({ ...prev, [problemNumber]: e.target.value }))}
                    placeholder="Optional input for Run Code"
                    rows={3}
                    disabled={isExpired}
                    spellCheck={false}
                    className="mono-tag w-full rounded-md border border-line bg-ink px-3 py-2 text-xs text-ivory placeholder:text-paper/30 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan disabled:opacity-50"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isExpired || runningProblem === problemNumber || savingProblem === problemNumber}
                    onClick={() => handleRun(problemNumber)}
                    className="mono-tag rounded-md border border-cyan px-4 py-2 text-xs uppercase tracking-widest text-cyan transition hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {runningProblem === problemNumber ? "Running…" : "Run Code"}
                  </button>
                  <button
                    type="button"
                    disabled={isExpired || savingProblem === problemNumber}
                    onClick={() => handleCodeSubmit(problemNumber)}
                    className={`mono-tag rounded-md border ${a.border} ${a.bg} px-4 py-2 text-xs uppercase tracking-widest ${a.text} transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {savingProblem === problemNumber ? "Checking…" : "Submit Code"}
                  </button>
                </div>

                {execution ? (
                  <div className="mt-4 rounded-md border border-line bg-ink/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="mono-tag text-[10px] uppercase tracking-widest text-cyan">Run Result: {execution.status.replace("_", " ")}</p>
                      <span className="text-xs text-paper/50">{execution.duration_ms} ms</span>
                    </div>
                    {execution.stdout ? <pre className="mt-2 whitespace-pre-wrap text-xs text-green">{execution.stdout}</pre> : null}
                    {execution.stderr ? <pre className="mt-2 whitespace-pre-wrap text-xs text-red">{execution.stderr}</pre> : null}
                  </div>
                ) : null}

                {codeSubmission ? (
                  <div className={`mt-3 rounded-md border p-3 ${codeSubmission.accepted ? "border-green/50 bg-green/10" : "border-red/50 bg-red/10"}`}>
                    <p className={`mono-tag text-[10px] uppercase tracking-widest ${codeSubmission.accepted ? "text-green" : "text-red"}`}>
                      {codeSubmission.status.replace("_", " ")}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/competition"
            className={`mono-tag rounded-md border ${a.border} px-8 py-3 text-sm uppercase tracking-widest ${a.text} hover:${a.bg}`}
          >
            Back to Competition
          </Link>
        </div>
      </div>
    </div>
  );
}
