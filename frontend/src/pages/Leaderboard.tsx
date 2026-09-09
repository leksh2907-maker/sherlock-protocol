import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLeaderboard, type LeaderboardEntry } from "../lib/api";
import Fingerprint from "../components/Fingerprint";

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-board px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mono-tag mb-6 inline-block text-[11px] uppercase tracking-widest text-paper/50 hover:text-cyan"
        >
          ← Back to Home
        </Link>

        <div className="mb-8 text-center">
          <Fingerprint className="mx-auto mb-4 h-12 w-12 text-gold/70" />
          <p className="mono-tag text-xs uppercase tracking-[0.4em] text-gold">
            Top Teams
          </p>
          <h1 className="mt-3 font-display text-3xl text-ivory sm:text-4xl">
            Leaderboard
          </h1>
          <p className="mt-2 text-sm text-paper/70">
            Ranked by score across every registered team.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-panel/90 shadow-card">
          {loading ? (
            <p className="p-8 text-center text-sm text-paper/70">Loading rankings…</p>
          ) : error ? (
            <p className="p-8 text-center text-sm text-red">{error}</p>
          ) : entries.length === 0 ? (
            <p className="p-8 text-center text-sm text-paper/70">
              No scores yet — be the first to solve the case.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="mono-tag border-b border-line text-[11px] uppercase tracking-widest text-cyan/80">
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Team & Investigators</th>
                  <th className="hidden px-4 py-3 text-center md:table-cell">R1 (Quiz)</th>
                  <th className="hidden px-4 py-3 text-center md:table-cell">R2 (Coding)</th>
                  <th className="px-4 py-3 text-right">Online Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.rank}
                    className="border-b border-line/60 last:border-0 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`mono-tag ${
                          entry.rank <= 3 ? "text-gold font-bold" : "text-paper/60"
                        }`}
                      >
                        #{entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ivory font-medium">{entry.team_name}</p>
                      {entry.participant1_name && entry.participant2_name ? (
                        <p className="text-xs text-paper/50">
                          {entry.participant1_name} & {entry.participant2_name}
                        </p>
                      ) : null}
                    </td>
                    <td className="hidden px-4 py-3 text-center mono-tag text-xs text-green md:table-cell">
                      {entry.round1_score}/20
                    </td>
                    <td className="hidden px-4 py-3 text-center mono-tag text-xs text-cyan md:table-cell">
                      {entry.round2_correct}/5
                    </td>
                    <td className="px-4 py-3 text-right font-display text-lg text-ivory">
                      {entry.score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
