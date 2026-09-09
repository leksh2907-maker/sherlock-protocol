import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn, fetchTeamStatus } from "../lib/api";
import Fingerprint from "../components/Fingerprint";

export default function PlayerSetup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login", { replace: true });
      return;
    }
    fetchTeamStatus()
      .then((status) => {
        if (status.team) {
          navigate("/competition", { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-board">
        <p className="mono-tag text-sm uppercase tracking-widest text-paper/60">Verifying session…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-board px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Fingerprint className="mx-auto mb-4 h-14 w-14 text-cyan/70" />
          <p className="mono-tag text-xs uppercase tracking-[0.4em] text-cyan">
            Team Verification
          </p>
          <h1 className="mt-3 font-display text-3xl text-ivory">Team Assignment Pending</h1>
          <p className="mt-2 text-sm text-paper/70">
            Your organizer must create your team before you can access the competition.
          </p>
        </div>
      </div>
    </div>
  );
}
