import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../lib/api";
import AuthPageShell from "../components/AuthPageShell";

export default function Login() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await loginUser(userId.trim(), password);
      if (user.is_admin) {
        navigate("/admin");
      } else {
        navigate("/setup");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Participant Authentication"
      title="Team Login"
      subtitle="Log in using the credentials provided by the organizers."
      accent="cyan"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mono-tag mb-1.5 block text-[11px] uppercase tracking-widest text-cyan">
            User ID
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="e.g. team_alpha_01"
            required
            className="w-full rounded-md border border-line bg-ink px-4 py-2.5 text-ivory placeholder:text-paper/30 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
        </div>

        <div>
          <label className="mono-tag mb-1.5 block text-[11px] uppercase tracking-widest text-cyan">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-md border border-line bg-ink px-4 py-2.5 text-ivory placeholder:text-paper/30 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
        </div>

        {error ? <p className="text-sm text-red">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="mono-tag w-full rounded-md border border-cyan bg-cyan/10 px-4 py-3 text-sm uppercase tracking-widest text-cyan transition hover:bg-cyan hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Authenticating…" : "Log In"}
        </button>
      </form>
    </AuthPageShell>
  );
}
