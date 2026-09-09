import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchTeamStatus, isLoggedIn, startTeamRound3, submitTeamRound3, type TeamStatus } from "../lib/api";
import Fingerprint from "../components/Fingerprint";

export default function Round3() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TeamStatus | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
        if (data.round3.access && !data.round3.submitted) {
          return startTeamRound3().then((round) => {
            setSecondsLeft((new Date(round.timer.expires_at).getTime() - Date.now()) / 1000);
            setStatus((current) => current ? { ...current, round3: { ...current.round3, timer: round.timer, timer_expired: round.timer.is_expired, submission: round.submission } } : current);
          });
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (secondsLeft === null) return;
    const interval = setInterval(() => setSecondsLeft((new Date(status?.round3.timer?.expires_at || 0).getTime() - Date.now()) / 1000), 1000);
    return () => clearInterval(interval);
  }, [secondsLeft, status?.round3.timer?.expires_at]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await submitTeamRound3(answer);
      setStatus((current) => current ? {
        ...current,
        round3: {
          ...current.round3,
          submitted: true,
          qualified: result.qualified,
          submission: result.submission,
          result: result.result,
        },
      } : current);
      setMessage(result.qualified ? "Round 3 completed successfully." : "Answer recorded. The required code word was not found.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-board"><p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Loading Round 3…</p></div>;
  }

  if (error && !status) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center"><p className="text-sm text-red">{error}</p><Link to="/competition" className="mono-tag text-xs uppercase tracking-widest text-cyan hover:underline">Back to Competition</Link></div>;
  }

  const round3 = status?.round3;
  if (!round3?.access && !round3?.submitted) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center"><p className="mono-tag text-xs uppercase tracking-widest text-gold">Round 3 Locked</p><p className="text-sm text-paper/70">Complete Round 2 and wait for the organizer to unlock this round.</p><Link to="/competition" className="mono-tag text-xs uppercase tracking-widest text-cyan hover:underline">Back to Competition</Link></div>;
  }

  const result = round3.result;
  const expired = secondsLeft !== null && secondsLeft <= 0;
  return (
    <div className="min-h-screen bg-board px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <Fingerprint className="mx-auto mb-4 h-12 w-12 text-gold" />
          <p className="mono-tag text-xs uppercase tracking-[0.4em] text-gold">Round 3</p>
          <h1 className="mt-3 font-display text-3xl text-ivory">Final Investigation</h1>
          <p className="mt-2 text-sm text-paper/70">Submit one answer in no more than 50 words.</p>
          <p className={`mono-tag mt-3 text-lg ${expired ? "text-red" : "text-gold"}`}>{expired ? "Time up" : secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${Math.max(0, Math.floor(secondsLeft % 60)).toString().padStart(2, "0")}` : "--:--"}</p>
        </div>

        {error ? <p className="mb-4 rounded border border-red/50 bg-red/10 px-4 py-3 text-sm text-red">{error}</p> : null}
        {message ? <p className={`mb-4 rounded border px-4 py-3 text-sm ${round3.qualified ? "border-green/50 bg-green/10 text-green" : "border-gold/50 bg-gold/10 text-gold"}`}>{message}</p> : null}

        <form onSubmit={handleSubmit} className="rounded-lg border border-gold/40 bg-panel/90 p-6 shadow-card">
          <label className="block text-sm text-paper/80">
            <span className="mono-tag mb-2 block text-[10px] uppercase tracking-widest text-gold">Your Answer</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={500}
              rows={7}
              disabled={submitting || round3.qualified || round3.submitted || expired}
              placeholder="Enter your investigation answer"
              className="w-full rounded-md border border-line bg-ink px-3 py-3 text-sm leading-relaxed text-ivory placeholder:text-paper/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold disabled:opacity-60"
            />
          </label>
          <p className="mt-2 text-right text-xs text-paper/50">{answer.trim() ? answer.trim().split(/\s+/).length : 0} / 50 words</p>
          <button type="submit" disabled={submitting || round3.qualified || round3.submitted || expired || !answer.trim()} className="mono-tag mt-4 rounded-md border border-gold bg-gold/10 px-8 py-3 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? "Submitting…" : round3.qualified ? "Round 3 Complete" : round3.submitted ? "Awaiting Admin Retry" : "Submit"}
          </button>
        </form>

        {result ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-green/40 bg-green/5 p-4"><p className="mono-tag text-[10px] uppercase tracking-widest text-green">Code Word</p><p className="mt-2 font-display text-lg text-ivory">{result.code_word}</p></div>
            <div className="rounded-md border border-cyan/40 bg-cyan/5 p-4"><p className="mono-tag text-[10px] uppercase tracking-widest text-cyan">Key Update</p><p className="mt-2 text-sm leading-relaxed text-paper/90">{result.key_update}</p></div>
          </div>
        ) : null}

        <div className="mt-8 text-center"><Link to="/competition" className="mono-tag text-xs uppercase tracking-widest text-paper/50 hover:text-cyan">Back to Competition</Link></div>
      </div>
    </div>
  );
}
