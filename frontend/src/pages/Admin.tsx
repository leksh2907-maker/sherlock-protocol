import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  isLoggedIn,
  fetchProfile,
  fetchAdminStats,
  fetchAdminRounds,
  updateRoundConfig,
  fetchAdminUsers,
  fetchAdminContacts,
  fetchAdminNewsletter,
  logoutUser,
  type AdminStats,
  type ApiUser,
  type ContactMessageEntry,
  type NewsletterSubscriberEntry,
  type AdminRoundsOverview,
} from "../lib/api";
import Fingerprint from "../components/Fingerprint";
import QuestionPoolsPanel from "../components/admin/QuestionPoolsPanel";
import TeamsPanel from "../components/admin/TeamsPanel";

type AccessState = "checking" | "denied" | "granted";

export default function Admin() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<AccessState>("checking");
  const [error, setError] = useState("");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rounds, setRounds] = useState<AdminRoundsOverview | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [contacts, setContacts] = useState<ContactMessageEntry[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriberEntry[]>([]);
  const [savingRound, setSavingRound] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }
    fetchProfile()
      .then((user) => setAccess(user.is_admin ? "granted" : "denied"))
      .catch(() => setAccess("denied"));
  }, [navigate]);

  useEffect(() => {
    if (access !== "granted") return;
    Promise.all([fetchAdminStats(), fetchAdminRounds(), fetchAdminUsers(), fetchAdminContacts(), fetchAdminNewsletter()])
      .then(([statsData, roundsData, usersData, contactsData, subscribersData]) => {
        setStats(statsData);
        setRounds(roundsData);
        setUsers(usersData);
        setContacts(contactsData);
        setSubscribers(subscribersData);
      })
      .catch((err) => setError((err as Error).message));
  }, [access]);

  async function handleToggleRound(roundNumber: 1 | 2 | 3, isUnlocked: boolean) {
    setSavingRound(roundNumber);
    try {
      await updateRoundConfig(roundNumber, { is_unlocked: isUnlocked });
      setRounds(await fetchAdminRounds());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRound(null);
    }
  }

  async function handleDurationChange(roundNumber: 1 | 2 | 3, minutes: number) {
    if (!minutes || minutes <= 0) return;
    setSavingRound(roundNumber);
    try {
      await updateRoundConfig(roundNumber, { duration_minutes: minutes });
      setRounds(await fetchAdminRounds());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRound(null);
    }
  }

  async function handleRoundContentChange(roundNumber: 1 | 2 | 3, updates: { code_word?: string; key_update?: string }) {
    setSavingRound(roundNumber);
    try {
      await updateRoundConfig(roundNumber, updates);
      setRounds(await fetchAdminRounds());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRound(null);
    }
  }

  async function handleLogout() {
    await logoutUser();
    navigate("/");
  }

  if (access === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-board">
        <p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Verifying access…</p>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-board px-6 text-center">
        <Fingerprint className="h-12 w-12 text-red/70" />
        <p className="mono-tag text-xs uppercase tracking-[0.4em] text-red">Access Denied</p>
        <h1 className="font-display text-2xl text-ivory">Admins Only</h1>
        <p className="max-w-sm text-sm text-paper/70">
          This dashboard is restricted to case organizers. If you believe this is a mistake, contact your event administrator.
        </p>
        <Link to="/" className="mono-tag mt-2 rounded-md border border-line px-6 py-2.5 text-xs uppercase tracking-widest text-paper/70 hover:border-cyan/50 hover:text-cyan">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-board px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mono-tag text-xs uppercase tracking-[0.4em] text-gold">Organizer Dashboard</p>
            <h1 className="mt-1 font-display text-3xl text-ivory">Sherlock Protocol — Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="mono-tag text-[11px] uppercase tracking-widest text-paper/50 hover:text-cyan">
              ← Site
            </Link>
            <button
              onClick={handleLogout}
              className="mono-tag rounded border border-red/50 bg-red/10 px-4 py-2 text-[11px] uppercase tracking-widest text-red hover:bg-red/20"
            >
              Log Out
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-6 rounded-md border border-red/50 bg-red/10 px-4 py-3 text-sm text-red">{error}</p>
        ) : null}

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Participants" value={stats?.total_participants ?? "—"} accent="cyan" />
          <StatCard label="Teams" value={stats?.total_teams ?? "—"} accent="gold" />
          <StatCard label="Round 1 Submitted" value={stats?.round1_submitted ?? "—"} accent="paper" />
          <StatCard label="Eligible" value={stats?.round1_eligible ?? "—"} accent="green" />
          <StatCard label="Eliminated" value={stats?.round1_eliminated ?? "—"} accent="red" />
        </div>

        {/* Competition Control */}
        <section className="mb-8 rounded-lg border border-line bg-panel/90 shadow-card">
          <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">Competition Control</h2>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {rounds ? (
              <>
                <RoundControlCard
                  roundNumber={1}
                  title="Round 1 — Quiz"
                  config={rounds.round1.config}
                  extra={`${rounds.round1.participants} teams · ${rounds.round1.eligible ?? 0} eligible · ${rounds.round1.eliminated ?? 0} eliminated`}
                  saving={savingRound === 1}
                  onToggle={handleToggleRound}
                  onDuration={handleDurationChange}
                  onContent={handleRoundContentChange}
                />
                <RoundControlCard
                  roundNumber={3}
                  title="Round 3 — Final Answer"
                  config={rounds.round3.config}
                  extra={`${rounds.round3.participants} submitted · ${rounds.round3.qualified ?? 0} qualified`}
                  saving={savingRound === 3}
                  onToggle={handleToggleRound}
                  onDuration={handleDurationChange}
                  onContent={handleRoundContentChange}
                />
                <RoundControlCard
                  roundNumber={2}
                  title="Round 2 — Programming"
                  config={rounds.round2.config}
                  extra={`${rounds.round2.participants} teams · ${rounds.round2.completed} completed`}
                  saving={savingRound === 2}
                  onToggle={handleToggleRound}
                  onDuration={handleDurationChange}
                  onContent={handleRoundContentChange}
                />
              </>
            ) : (
              <p className="text-sm text-paper/60">Loading round configuration…</p>
            )}
          </div>
        </section>

        <QuestionPoolsPanel />
        <TeamsPanel />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-line bg-panel/90 shadow-card">
            <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">
              Accounts <span className="mono-tag text-xs text-paper/50">({users.length})</span>
            </h2>
            <div className="max-h-96 overflow-y-auto p-5">
              {users.length === 0 ? (
                <p className="text-sm text-paper/60">No accounts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between rounded-md border border-line bg-ink/60 px-3 py-2">
                      <div>
                        <span className="text-sm text-ivory">{u.username}</span>
                        <span className="ml-2 text-xs text-paper/40">{u.email}</span>
                      </div>
                      {u.is_admin ? (
                        <span className="mono-tag rounded border border-red/40 bg-red/10 px-2 py-0.5 text-[10px] uppercase text-red">admin</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel/90 shadow-card">
            <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">
              Newsletter Subscribers <span className="mono-tag text-xs text-paper/50">({subscribers.length})</span>
            </h2>
            <div className="max-h-96 overflow-y-auto p-5">
              {subscribers.length === 0 ? (
                <p className="text-sm text-paper/60">No subscribers yet.</p>
              ) : (
                <ul className="space-y-2">
                  {subscribers.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-md border border-line bg-ink/60 px-3 py-2">
                      <span className="text-sm text-ivory">{s.email}</span>
                      <span className="text-xs text-paper/40">{new Date(s.subscribed_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-line bg-panel/90 shadow-card">
          <h2 className="border-b border-line px-5 py-4 font-display text-lg text-ivory">
            Contact Messages <span className="mono-tag text-xs text-paper/50">({contacts.length})</span>
          </h2>
          <div className="max-h-96 overflow-y-auto p-5">
            {contacts.length === 0 ? (
              <p className="text-sm text-paper/60">No messages yet.</p>
            ) : (
              <ul className="space-y-3">
                {contacts.map((c) => (
                  <li key={c.id} className="rounded-md border border-line bg-ink/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-ivory">{c.name}</p>
                      <p className="text-xs text-paper/40">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="mono-tag text-xs text-cyan/80">{c.email}</p>
                    <p className="mt-1.5 text-sm text-paper/80">{c.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent: "green" | "cyan" | "gold" | "red" | "paper" }) {
  const accentText: Record<string, string> = { green: "text-green", cyan: "text-cyan", gold: "text-gold", red: "text-red", paper: "text-ivory" };
  return (
    <div className="rounded-lg border border-line bg-panel/90 p-4 shadow-card">
      <p className="mono-tag text-[10px] uppercase tracking-widest text-paper/50">{label}</p>
      <p className={`mt-1 font-display text-2xl ${accentText[accent]}`}>{value}</p>
    </div>
  );
}

function RoundControlCard({
  roundNumber,
  title,
  config,
  extra,
  saving,
  onToggle,
  onDuration,
  onContent,
}: {
  roundNumber: 1 | 2 | 3;
  title: string;
  config: { is_unlocked: boolean; duration_minutes: number; code_word?: string; key_update?: string } | null;
  extra: string;
  saving: boolean;
  onToggle: (round: 1 | 2 | 3, isUnlocked: boolean) => void;
  onDuration: (round: 1 | 2 | 3, minutes: number) => void;
  onContent?: (round: 1 | 2 | 3, updates: { code_word?: string; key_update?: string }) => void;
}) {
  const [duration, setDuration] = useState(config?.duration_minutes ?? 10);
  const [codeWord, setCodeWord] = useState((config as { code_word?: string } | null)?.code_word ?? "");
  const [keyUpdate, setKeyUpdate] = useState((config as { key_update?: string } | null)?.key_update ?? "");

  useEffect(() => {
    if (config) setDuration(config.duration_minutes);
    if (config) {
      setCodeWord((config as { code_word?: string }).code_word ?? "");
      setKeyUpdate((config as { key_update?: string }).key_update ?? "");
    }
  }, [config]);

  if (!config) return null;

  return (
    <div className={`rounded-md border p-4 ${config.is_unlocked ? "border-green/40 bg-green/5" : "border-line bg-ink/40"}`}>
      <div className="flex items-center justify-between">
        <p className="font-display text-sm text-ivory">{title}</p>
        <span className={`mono-tag rounded border px-2 py-0.5 text-[10px] uppercase ${config.is_unlocked ? "border-green/50 text-green" : "border-line text-paper/50"}`}>
          {config.is_unlocked ? "Unlocked" : "Locked"}
        </span>
      </div>
      <p className="mt-1 text-xs text-paper/60">{extra}</p>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          onBlur={() => onDuration(roundNumber, duration)}
          disabled={saving}
          className="w-20 rounded border border-line bg-ink px-2 py-1 text-sm text-ivory focus:border-cyan focus:outline-none"
        />
        <span className="text-xs text-paper/50">minutes</span>
      </div>

      {(
        <div className="mt-3 space-y-2">
          <input value={codeWord} onChange={(e) => setCodeWord(e.target.value)} onBlur={() => onContent?.(roundNumber, { code_word: codeWord })} placeholder="Code word" disabled={saving} className="w-full rounded border border-line bg-ink px-2 py-1.5 text-sm text-ivory focus:border-gold focus:outline-none" />
          <textarea value={keyUpdate} onChange={(e) => setKeyUpdate(e.target.value)} onBlur={() => onContent?.(roundNumber, { key_update: keyUpdate })} placeholder="Key update" rows={3} disabled={saving} className="w-full rounded border border-line bg-ink px-2 py-1.5 text-sm text-ivory focus:border-gold focus:outline-none" />
        </div>
      )}

      <button
        disabled={saving}
        onClick={() => onToggle(roundNumber, !config.is_unlocked)}
        className={`mono-tag mt-3 w-full rounded-md border px-3 py-2 text-xs uppercase tracking-widest transition disabled:opacity-50 ${
          config.is_unlocked ? "border-red/50 text-red hover:bg-red/10" : "border-green/50 text-green hover:bg-green/10"
        }`}
      >
        {saving ? "Saving…" : config.is_unlocked ? "Lock Round" : "Unlock Round"}
      </button>
    </div>
  );
}
