import { useState, FormEvent } from "react";
import { submitContactMessage } from "../lib/api";
import AuthPageShell from "../components/AuthPageShell";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await submitContactMessage(name.trim(), email.trim(), message.trim());
      setSuccess(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Contact Sherlock Labs"
      title="Send a Message"
      subtitle="Questions, feedback, or tip-offs — we read every message."
      accent="red"
    >
      {success ? (
        <div className="text-center">
          <p className="text-sm text-green">
            Message received. Thanks for reaching out!
          </p>
          <button
            type="button"
            onClick={() => setSuccess(false)}
            className="mono-tag mt-4 text-xs uppercase tracking-widest text-cyan hover:underline"
          >
            Send another message
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mono-tag mb-1.5 block text-[11px] uppercase tracking-widest text-red">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-md border border-line bg-ink px-4 py-2.5 text-ivory placeholder:text-paper/30 focus:border-red focus:outline-none focus:ring-1 focus:ring-red"
            />
          </div>

          <div>
            <label className="mono-tag mb-1.5 block text-[11px] uppercase tracking-widest text-red">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-line bg-ink px-4 py-2.5 text-ivory placeholder:text-paper/30 focus:border-red focus:outline-none focus:ring-1 focus:ring-red"
            />
          </div>

          <div>
            <label className="mono-tag mb-1.5 block text-[11px] uppercase tracking-widest text-red">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={5}
              maxLength={5000}
              rows={5}
              className="w-full rounded-md border border-line bg-ink px-4 py-2.5 text-ivory placeholder:text-paper/30 focus:border-red focus:outline-none focus:ring-1 focus:ring-red"
            />
          </div>

          {error ? <p className="text-sm text-red">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mono-tag w-full rounded-md border border-red bg-red/10 px-4 py-3 text-sm uppercase tracking-widest text-red transition hover:bg-red hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send Message"}
          </button>
        </form>
      )}
    </AuthPageShell>
  );
}
