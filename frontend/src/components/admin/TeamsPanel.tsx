import { useEffect, useState, FormEvent } from "react";
import {
  fetchAdminTeams,
  gradeTeamSubmission,
  createAdminTeam,
  qualifyTeamRound2,
  enableTeamRound3,
  retryTeamRound,
  type AdminTeam,
  type RoundSubmissionEntry,
} from "../../lib/api";

export default function TeamsPanel() {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create Team Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p1UserId, setP1UserId] = useState("");
  const [p1Password, setP1Password] = useState("");
  const [p2UserId, setP2UserId] = useState("");
  const [p2Password, setP2Password] = useState("");
  const [creating, setCreating] = useState(false);

  // Action loading states
  const [qualifyingTeamId, setQualifyingTeamId] = useState<number | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);

  function loadTeams() {
    setLoading(true);
    fetchAdminTeams()
      .then(setTeams)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(loadTeams, []);

  async function handleCreateTeam(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);
    try {
      await createAdminTeam({
        team_name: teamName.trim(),
        participant1_name: p1Name.trim(),
        participant2_name: p2Name.trim(),
        participant1_user_id: p1UserId.trim(),
        participant1_password: p1Password,
        participant2_user_id: p2UserId.trim(),
        participant2_password: p2Password,
      });
      setSuccess(`Team '${teamName.trim()}' created successfully!`);
      setTeamName("");
      setP1Name("");
      setP2Name("");
      setP1UserId("");
      setP1Password("");
      setP2UserId("");
      setP2Password("");
      setShowCreateModal(false);
      loadTeams();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleRound2(teamId: number, currentQualified: boolean) {
    setQualifyingTeamId(teamId);
    setError("");
    try {
      await qualifyTeamRound2(teamId, !currentQualified);
      loadTeams();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setQualifyingTeamId(null);
    }
  }

  async function handleGrade(teamId: number, roundNumber: number, problemNumber: number, result: "correct" | "incorrect") {
    try {
      await gradeTeamSubmission(teamId, roundNumber, problemNumber, result);
      loadTeams();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleToggleRound3(teamId: number, enabled: boolean) {
    setActionKey(`r3-${teamId}`);
    try {
      await enableTeamRound3(teamId, !enabled);
      loadTeams();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionKey(null);
    }
  }

  async function handleRetry(teamId: number, roundNumber: 1 | 2 | 3) {
    setActionKey(`retry-${teamId}-${roundNumber}`);
    try {
      await retryTeamRound(teamId, roundNumber);
      setSuccess(`Round ${roundNumber} reset. The team can retry it.`);
      loadTeams();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionKey(null);
    }
  }

  const pendingGrading: { team: AdminTeam; submission: RoundSubmissionEntry }[] = [];
  const round3Submissions: { team: AdminTeam; submission: RoundSubmissionEntry }[] = [];
  teams.forEach((t) => {
    t.round2_submissions.forEach((s) => {
      if (s.status === "submitted" && s.result === "pending") {
        pendingGrading.push({ team: t, submission: s });
      }
    });
    if (t.round3_submission) round3Submissions.push({ team: t, submission: t.round3_submission });
  });

  return (
    <>
      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-gold/50 bg-panel p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <div>
                <p className="mono-tag text-xs uppercase tracking-widest text-gold">Organizer Action</p>
                <h3 className="font-display text-xl text-ivory">Create New Team</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="mono-tag text-paper/60 hover:text-red text-sm"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="mono-tag block text-[11px] uppercase tracking-widest text-gold mb-1">
                  Team Name *
                </label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Cyber Sleuths"
                  className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-gold focus:outline-none"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-green mb-1">
                    Participant 1 Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={p1Name}
                    onChange={(e) => setP1Name(e.target.value)}
                    placeholder="e.g. Alice Walker"
                    className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-green focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-green mb-1">
                    Participant 2 Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={p2Name}
                    onChange={(e) => setP2Name(e.target.value)}
                    placeholder="e.g. Bob Chen"
                    className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-green focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-cyan mb-1">
                    User ID (Username) *
                  </label>
                  <input
                    type="text"
                    required
                    value={p1UserId}
                    onChange={(e) => setP1UserId(e.target.value)}
                    placeholder="e.g. team_cyber_01"
                    className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-cyan mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={p1Password}
                    onChange={(e) => setP1Password(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-cyan mb-1">Participant 2 User ID *</label>
                  <input type="text" required value={p2UserId} onChange={(e) => setP2UserId(e.target.value)} placeholder="e.g. team_cyber_02" className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none" />
                </div>
                <div>
                  <label className="mono-tag block text-[11px] uppercase tracking-widest text-cyan mb-1">Participant 2 Password *</label>
                  <input type="password" required minLength={8} value={p2Password} onChange={(e) => setP2Password(e.target.value)} placeholder="At least 8 characters" className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none" />
                </div>
              </div>
              <p className="text-[11px] text-paper/60">The organizer creates both accounts. Participants only log in with their assigned credentials.</p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="mono-tag rounded border border-line px-4 py-2 text-xs uppercase tracking-widest text-paper/70 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="mono-tag rounded border border-gold bg-gold/10 px-5 py-2 text-xs uppercase tracking-widest text-gold hover:bg-gold hover:text-ink transition disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Save Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Grading Section */}
      <section className="mb-8 rounded-lg border border-gold/40 bg-panel/90 shadow-card">
        <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">
          Round 2 Pending Grading <span className="mono-tag text-xs text-paper/50">({pendingGrading.length})</span>
        </h2>
        <div className="max-h-80 overflow-y-auto p-5">
          {error ? <p className="mb-3 text-sm text-red">{error}</p> : null}
          {success ? <p className="mb-3 text-sm text-green">{success}</p> : null}
          {pendingGrading.length === 0 ? (
            <p className="text-sm text-paper/60">No Round 2 submissions waiting for review.</p>
          ) : (
            <ul className="space-y-3">
              {pendingGrading.map(({ team, submission }) => (
                <li
                  key={`${team.team.id}-${submission.round_number}-${submission.problem_number}`}
                  className="rounded-md border border-line bg-ink/60 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ivory">
                      <span className="font-bold">{team.team.name}</span> —{" "}
                      <span className="mono-tag text-xs text-cyan">
                        Problem {submission.problem_number}
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGrade(team.team.id, submission.round_number, submission.problem_number, "correct")}
                        className="mono-tag rounded border border-green/50 bg-green/10 px-3 py-1 text-[10px] uppercase text-green hover:bg-green/20"
                      >
                        Correct
                      </button>
                      <button
                        onClick={() => handleGrade(team.team.id, submission.round_number, submission.problem_number, "incorrect")}
                        className="mono-tag rounded border border-red/50 bg-red/10 px-3 py-1 text-[10px] uppercase text-red hover:bg-red/20"
                      >
                        Incorrect
                      </button>
                    </div>
                  </div>
                  {submission.submission_text ? (
                    <p className="mono-tag mt-2 whitespace-pre-wrap text-xs text-paper/70">{submission.submission_text}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-cyan/40 bg-panel/90 shadow-card">
        <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">
          Round 3 Answers <span className="mono-tag text-xs text-paper/50">({round3Submissions.length})</span>
        </h2>
        <div className="max-h-80 overflow-y-auto p-5">
          {round3Submissions.length === 0 ? <p className="text-sm text-paper/60">No Round 3 answers submitted yet.</p> : (
            <ul className="space-y-3">
              {round3Submissions.map(({ team, submission }) => (
                <li key={team.team.id} className="rounded-md border border-line bg-ink/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ivory"><span className="font-bold">{team.team.name}</span> — Round 3 answer</p>
                    <span className={`mono-tag rounded border px-2 py-0.5 text-[10px] uppercase ${submission.result === "correct" ? "border-green/50 text-green" : "border-red/50 text-red"}`}>{submission.result}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-paper/80">{submission.submission_text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Teams Management Section */}
      <section className="mb-8 rounded-lg border border-line bg-panel/90 shadow-card">
        <div className="flex flex-wrap items-center justify-between border-b border-line px-5 py-4 gap-3">
          <h2 className="font-display text-lg text-ivory">
            Teams & Qualification <span className="mono-tag text-xs text-paper/50">({teams.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mono-tag rounded border border-gold bg-gold/10 px-4 py-1.5 text-xs uppercase tracking-widest text-gold hover:bg-gold hover:text-ink transition"
          >
            + Create Team (2 Members)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead>
              <tr className="mono-tag border-b border-line text-[10px] uppercase tracking-widest text-cyan/80">
                <th className="px-4 py-3">Team & User ID</th>
                <th className="px-4 py-3">Investigators (2)</th>
                <th className="px-4 py-3 text-center">Round 1 (Quiz)</th>
                <th className="px-4 py-3 text-center">Round 2 Qualification</th>
                <th className="px-4 py-3 text-center">Round 2 (Coding)</th>
                <th className="px-4 py-3 text-center">Round 3 Access</th>
                <th className="px-4 py-3 text-center">Retry</th>
                <th className="px-4 py-3 text-right">Online Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-paper/60">Loading teams…</td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-paper/60">
                    No teams yet. Click "+ Create Team" above to create participant accounts.
                  </td>
                </tr>
              ) : (
                teams.map((t) => {
                  const r2Correct = t.round2_submissions.filter((s) => s.result === "correct").length;
                  const isQualifying = qualifyingTeamId === t.team.id;
                  const isR2Qualified = Boolean(t.round2_qualified);
                  const isR3Enabled = Boolean(t.round3_enabled);

                  return (
                    <tr key={t.team.id} className="border-b border-line/60 last:border-0 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="font-display text-ivory text-base">{t.team.name}</p>
                        <p className="mono-tag text-[11px] text-cyan">
                          User IDs: <span className="text-ivory">{t.members.map((member) => member.username).join(", ") || t.login_user_id || "—"}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-paper/80">
                        {t.participant1_name && t.participant2_name ? (
                          <>
                            <p>1. {t.participant1_name}</p>
                            <p>2. {t.participant2_name}</p>
                          </>
                        ) : (
                          t.members.map((m) => m.username).join(", ") || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-center mono-tag text-xs">
                        {t.round1?.submitted ? (
                          <span className="font-bold text-green">{t.round1.score} / 10</span>
                        ) : (
                          <span className="text-paper/40">Not submitted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isQualifying}
                            onClick={() => handleToggleRound2(t.team.id, isR2Qualified)}
                            className={`mono-tag rounded px-3 py-1 text-[10px] uppercase tracking-wider transition ${
                              isR2Qualified
                                ? "border border-green bg-green/20 text-green hover:bg-red/20 hover:text-red hover:border-red"
                                : "border border-gold bg-gold/10 text-gold hover:bg-gold hover:text-ink font-bold shadow-glowGreen"
                            }`}
                          >
                            {isQualifying
                              ? "Saving…"
                              : isR2Qualified
                              ? "✓ Enabled (Click to Lock)"
                              : "ENABLE ROUND 2"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center mono-tag text-xs text-cyan">
                        {t.round2_submissions.length > 0
                          ? `${t.round2_submissions.filter((s) => s.status === "submitted").length}/5 · ${r2Correct} ✓`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={actionKey === `r3-${t.team.id}`}
                          onClick={() => handleToggleRound3(t.team.id, isR3Enabled)}
                          className={`mono-tag rounded px-3 py-1 text-[10px] uppercase tracking-wider ${isR3Enabled ? "border border-green bg-green/20 text-green" : "border border-gold bg-gold/10 text-gold"}`}
                        >
                          {actionKey === `r3-${t.team.id}` ? "Saving…" : isR3Enabled ? "✓ Enabled" : "Enable Round 3"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {[1, 2, 3].map((roundNumber) => (
                            <button
                              key={roundNumber}
                              type="button"
                              disabled={actionKey === `retry-${t.team.id}-${roundNumber}`}
                              onClick={() => handleRetry(t.team.id, roundNumber as 1 | 2 | 3)}
                              className="mono-tag rounded border border-red/40 px-2 py-1 text-[10px] uppercase text-red hover:bg-red/10"
                            >
                              {actionKey === `retry-${t.team.id}-${roundNumber}` ? "…" : `Retry R${roundNumber}`}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-display text-lg text-ivory">
                        {t.overall_score}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
