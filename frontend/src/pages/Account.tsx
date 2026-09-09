import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchProfile, logoutUser, isLoggedIn, type ApiUser } from "../lib/api";
import AuthPageShell from "../components/AuthPageShell";

export default function Account() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }
    fetchProfile()
      .then(setProfile)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [navigate]);

  async function handleLogout() {
    await logoutUser();
    navigate("/");
  }

  return (
    <AuthPageShell
      eyebrow="Investigator Profile"
      title="My Account"
      subtitle="Your account details, synced with the case server."
      accent="gold"
    >
      {loading ? (
        <p className="text-center text-sm text-paper/70">Loading profile…</p>
      ) : error ? (
        <div className="text-center">
          <p className="text-sm text-red">{error}</p>
          <Link
            to="/login"
            className="mono-tag mt-4 inline-block text-xs uppercase tracking-widest text-cyan hover:underline"
          >
            Back to Login
          </Link>
        </div>
      ) : profile ? (
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-ink/60 p-4">
            <p className="mono-tag text-[11px] uppercase tracking-widest text-gold">
              Username
            </p>
            <p className="mt-1 font-display text-lg text-ivory">{profile.username}</p>
          </div>
          <div className="rounded-md border border-line bg-ink/60 p-4">
            <p className="mono-tag text-[11px] uppercase tracking-widest text-gold">
              Email
            </p>
            <p className="mt-1 text-sm text-paper/90">{profile.email}</p>
          </div>
          <div className="rounded-md border border-line bg-ink/60 p-4">
            <p className="mono-tag text-[11px] uppercase tracking-widest text-gold">
              Account Created
            </p>
            <p className="mt-1 text-sm text-paper/90">
              {new Date(profile.created_at).toLocaleString()}
            </p>
          </div>
          {profile.is_admin ? (
            <p className="mono-tag text-center text-[11px] uppercase tracking-widest text-red">
              Admin Access Enabled
            </p>
          ) : null}

          <Link
            to="/competition"
            className="mono-tag block w-full rounded-md border border-green bg-green/10 px-4 py-3 text-center text-sm uppercase tracking-widest text-green transition hover:bg-green hover:text-ink"
          >
            Go to Competition
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="mono-tag w-full rounded-md border border-red bg-red/10 px-4 py-3 text-sm uppercase tracking-widest text-red transition hover:bg-red hover:text-ink"
          >
            Log Out
          </button>
        </div>
      ) : null}
    </AuthPageShell>
  );
}
