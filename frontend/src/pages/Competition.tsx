import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isLoggedIn, fetchTeamStatus, type TeamStatus } from "../lib/api";
import Fingerprint from "../components/Fingerprint";

function RoundStatusBadge({ label, tone }: { label: string; tone: "green" | "cyan" | "gold" | "red" | "paper" }) {
  const toneClasses: Record<string, string> = {
    green: "border-green/50 bg-green/10 text-green",
    cyan: "border-cyan/50 bg-cyan/10 text-cyan",
    gold: "border-gold/50 bg-gold/10 text-gold",
    red: "border-red/50 bg-red/10 text-red",
    paper: "border-line text-paper/50",
  };
  return (
    <span className={`mono-tag rounded border px-2.5 py-1 text-[11px] uppercase tracking-widest ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

export default function Competition() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TeamStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }
    fetchTeamStatus()
      .then((data) => {
        if (!data.team) {
          navigate("/setup", { replace: true });
          return;
        }
        setStatus(data);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-board">
        <p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Loading case status…</p>
      </div>
    );
  }

  if (error || !status || !status.team) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center">
        <p className="text-sm text-red">{error || "Could not load your team's status."}</p>
        <Link to="/" className="mono-tag text-xs uppercase tracking-widest text-cyan hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const { team, round1, round2, round3, final_result } = status;
  const round1Open = status.rounds["1"]?.is_unlocked;
  const round1Submitted = round1.submitted;

  const round2Access = round2.access;
  const round2Submitted = round2.submissions.filter((s) => s.status === "submitted").length;

  return (
    <div className="min-h-screen bg-board px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <Fingerprint className="mx-auto mb-4 h-14 w-14 text-green/70" />
          <p className="mono-tag text-xs uppercase tracking-[0.4em] text-cyan">
            Case 001: The Hacked Compiler
          </p>
          <h1 className="mt-3 font-display text-3xl text-ivory sm:text-4xl">{team.name}</h1>
          <p className="mt-2 text-sm text-paper/70">
            {team.participant1_name && team.participant2_name
              ? `Investigators: ${team.participant1_name} & ${team.participant2_name}`
              : status.members.map((m) => m.username).join(", ")}
          </p>
        </div>

        <div className="space-y-5">
          {/* Round 1 — Online MCQ Quiz */}
          <div className="rounded-lg border border-green/40 bg-panel/90 p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-ivory">Round 1 — Programming Quiz</h2>
              {round1Submitted ? (
                <RoundStatusBadge
                  label={`Submitted · ${round1.score}/20`}
                  tone="green"
                />
              ) : (
                <RoundStatusBadge label={round1Open ? "Open" : "Closed"} tone={round1Open ? "green" : "paper"} />
              )}
            </div>
            <p className="mt-2 text-sm text-paper/70">
              Exactly 20 multiple-choice questions on programming, algorithms, and technical fundamentals. 30-minute countdown.
            </p>
            <button
              type="button"
              disabled={!round1Open && !round1Submitted}
              onClick={() => navigate("/competition/round1")}
              className="mono-tag mt-4 rounded-md border border-green px-6 py-2.5 text-xs uppercase tracking-widest text-green transition hover:bg-green hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              {round1Submitted ? "View Round 1 Result" : "Enter Round 1"}
            </button>
          </div>

          {/* Round 2 — Online Programming Problems */}
          <div
            className={`rounded-lg border p-6 shadow-card ${
              round2Access
                ? "border-cyan/40 bg-panel/90"
                : "border-line bg-panel/60 opacity-85"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-ivory">Round 2 — Programming Challenges</h2>
              {!round1Submitted ? (
                <RoundStatusBadge label="Locked" tone="paper" />
              ) : !round2.qualified ? (
                <RoundStatusBadge label="Awaiting Admin Qualification" tone="gold" />
              ) : (
                <RoundStatusBadge label={`${round2Submitted}/5 Submitted`} tone="cyan" />
              )}
            </div>

            <p className="mt-2 text-sm text-paper/70">
              5 programming challenges with an isolated Docker compiler, automatic hidden-test evaluation, and a 60-minute countdown.
            </p>

            {!round1Submitted ? (
              <p className="mt-3 rounded border border-line bg-ink/50 px-3 py-2 text-xs text-paper/50">
                Complete and submit Round 1 to become eligible for review.
              </p>
            ) : !round2.qualified ? (
              <div className="mt-3 rounded border border-gold/40 bg-gold/5 p-3">
                <p className="mono-tag text-xs uppercase tracking-wider text-gold">
                  Qualification Pending
                </p>
                <p className="mt-1 text-xs text-paper/80">
                  Round 2 is locked. Please wait for the administrator to review your Round 1 score and qualify your team.
                </p>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!round2Access}
              onClick={() => navigate("/competition/round2")}
              className="mono-tag mt-4 rounded-md border border-cyan px-6 py-2.5 text-xs uppercase tracking-widest text-cyan transition hover:bg-cyan hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              {round2Access ? "Enter Round 2" : "Round 2 Locked"}
            </button>
          </div>

          {round1.result ? <CompletionReveal roundNumber={1} result={round1.result} /> : null}
          {round2.result ? <CompletionReveal roundNumber={2} result={round2.result} /> : null}

          {/* Round 3 — text answer */}
          <div className={`rounded-lg border p-6 shadow-card ${round3.access || round3.submitted ? "border-gold/40 bg-panel/90" : "border-line bg-panel/60 opacity-85"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-ivory">Round 3 — Final Answer</h2>
              <RoundStatusBadge label={round3.qualified ? "Qualified" : round3.submitted ? "Submitted" : round3.access ? "Open" : "Locked"} tone={round3.qualified ? "green" : round3.access ? "gold" : "paper"} />
            </div>
            <p className="mt-2 text-sm text-paper/70">Submit a concise answer of up to 50 words for organizer review.</p>
            {!final_result.round2_completed ? <p className="mt-3 rounded border border-line bg-ink/50 px-3 py-2 text-xs text-paper/50">Complete all five Round 2 challenges before entering Round 3.</p> : null}
            <button type="button" disabled={!round3.access && !round3.submitted} onClick={() => navigate("/competition/round3")} className="mono-tag mt-4 rounded-md border border-gold px-6 py-2.5 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-30">
              {round3.submitted ? "View Round 3" : "Enter Round 3"}
            </button>
          </div>
          {round3.result ? <CompletionReveal roundNumber={3} result={round3.result} /> : null}

          {/* Online result */}
          <div className="rounded-lg border border-gold/40 bg-panel/90 p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-ivory">Final Online Result</h2>
              <RoundStatusBadge
                label={
                  final_result.round2_completed
                    ? "Online Complete"
                    : round1Submitted
                    ? "R1 Done"
                    : "In Progress"
                }
                tone="gold"
              />
            </div>
            <p className="mt-2 text-sm text-paper/70">
              The final online score is computed from Round 1 and Round 2.
            </p>
            <button
              type="button"
              onClick={() => navigate("/leaderboard")}
              className="mono-tag mt-4 rounded-md border border-gold px-6 py-2.5 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink"
            >
              View Leaderboard
            </button>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-6">
          <Link
            to="/leaderboard"
            className="mono-tag text-[11px] uppercase tracking-widest text-paper/50 hover:text-gold"
          >
            Leaderboard →
          </Link>
          <Link
            to="/account"
            className="mono-tag text-[11px] uppercase tracking-widest text-paper/50 hover:text-cyan"
          >
            My Account →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CompletionReveal({ roundNumber, result }: { roundNumber: number; result: { code_word: string; key_update: string } }) {
  return (
    <div className="rounded-lg border border-green/30 bg-panel/70 p-5">
      <p className="mono-tag text-[10px] uppercase tracking-widest text-green">Round {roundNumber} Complete</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><p className="mono-tag text-[10px] uppercase tracking-widest text-gold">Code Word</p><p className="mt-1 font-display text-lg text-ivory">{result.code_word}</p></div>
        <div><p className="mono-tag text-[10px] uppercase tracking-widest text-cyan">Key Update</p><p className="mt-1 text-sm text-paper/85">{result.key_update}</p></div>
      </div>
    </div>
  );
}
