import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isLoggedIn, subscribeNewsletter } from "../lib/api";
import Fingerprint from "../components/Fingerprint";

export default function Landing() {
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  async function handleNewsletterSubmit(e: FormEvent) {
    e.preventDefault();
    setNewsletterStatus(null);
    setNewsletterLoading(true);
    try {
      await subscribeNewsletter(newsletterEmail.trim());
      setNewsletterStatus("Subscribed! Watch for new cases.");
      setNewsletterEmail("");
    } catch (err) {
      setNewsletterStatus((err as Error).message);
    } finally {
      setNewsletterLoading(false);
    }
  }

  function handleEnter() {
    navigate(loggedIn ? "/competition" : "/login");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-board px-6 py-16 text-center">
      <nav className="mono-tag absolute right-4 top-4 z-10 flex items-center gap-4 text-[11px] uppercase tracking-widest text-paper/60 sm:right-8 sm:top-6">
        <Link to="/leaderboard" className="hover:text-gold">
          Leaderboard
        </Link>
        <Link to="/contact" className="hover:text-cyan">
          Contact
        </Link>
        {loggedIn ? (
          <Link to="/account" className="hover:text-gold">
            My Account
          </Link>
        ) : (
          <Link to="/login" className="hover:text-cyan">
            Log In
          </Link>
        )}
      </nav>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-full w-full -translate-x-1/2 bg-gradient-to-b from-cyan/5 via-transparent to-transparent" />
        <div className="animate-scan absolute left-0 h-1/3 w-full bg-gradient-to-b from-transparent via-cyan/5 to-transparent" />
      </div>

      <Fingerprint className="relative mb-8 h-20 w-20 text-green/70 sm:h-24 sm:w-24" />

      <p className="mono-tag relative text-sm uppercase tracking-[0.5em] text-cyan">
        Drestein 2026
      </p>
      <h1 className="relative mt-4 font-display text-4xl leading-tight text-ivory text-shadow-glow sm:text-6xl">
        The Sherlock
        <br />
        Protocol
      </h1>

      <div className="relative mt-6 inline-flex items-center gap-2 rounded-full border border-red/50 bg-red/10 px-4 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red" />
        <span className="mono-tag text-xs uppercase tracking-widest text-red">
          Case 001: The Hacked Compiler
        </span>
      </div>

      <p className="relative mt-8 max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base">
        At 08:42 AM, Sherlock Compiler X was sabotaged. Error messages were rewritten.
        Logs were manipulated. Someone inside Sherlock Labs is responsible — and you're
        the last hope of finding out who.
      </p>

      <div className="relative mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleEnter}
          className="mono-tag rounded-md border border-green bg-green/10 px-8 py-3 text-sm uppercase tracking-widest text-green shadow-glowGreen transition hover:bg-green hover:text-ink"
        >
          {loggedIn ? "Enter Dashboard" : "Participant Login"}
        </button>
        {loggedIn ? (
          <button
            type="button"
            onClick={() => navigate("/competition")}
            className="mono-tag rounded-md border border-cyan/60 px-8 py-3 text-sm uppercase tracking-widest text-cyan transition hover:bg-cyan/10"
          >
            View Round Status
          </button>
        ) : null}
      </div>

      <form
        onSubmit={handleNewsletterSubmit}
        className="relative mt-14 flex w-full max-w-sm flex-col items-center gap-2 sm:flex-row"
      >
        <input
          type="email"
          required
          value={newsletterEmail}
          onChange={(e) => setNewsletterEmail(e.target.value)}
          placeholder="Get notified about new cases"
          className="w-full flex-1 rounded-md border border-line bg-ink px-4 py-2.5 text-sm text-ivory placeholder:text-paper/30 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={newsletterLoading}
          className="mono-tag w-full shrink-0 rounded-md border border-gold bg-gold/10 px-5 py-2.5 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {newsletterLoading ? "…" : "Subscribe"}
        </button>
      </form>
      {newsletterStatus ? (
        <p className="mono-tag relative mt-2 text-[11px] uppercase tracking-widest text-paper/60">
          {newsletterStatus}
        </p>
      ) : null}

      <p className="mono-tag relative mt-10 text-[11px] uppercase tracking-widest text-paper/40">
        #DecodeTheTruth
      </p>
    </div>
  );
}
