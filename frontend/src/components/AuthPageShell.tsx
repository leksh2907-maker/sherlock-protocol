import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Fingerprint from "./Fingerprint";

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent?: "green" | "cyan" | "gold" | "red";
  children: ReactNode;
}

const accentText: Record<string, string> = {
  green: "text-green",
  cyan: "text-cyan",
  gold: "text-gold",
  red: "text-red",
};

export default function AuthPageShell({
  eyebrow,
  title,
  subtitle,
  accent = "cyan",
  children,
}: AuthPageShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-board px-6 py-16">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mono-tag mb-6 inline-block text-[11px] uppercase tracking-widest text-paper/50 hover:text-cyan"
        >
          ← Back to Home
        </Link>

        <div className="mb-8 text-center">
          <Fingerprint className={`mx-auto mb-4 h-12 w-12 ${accentText[accent]}/70`} />
          <p className={`mono-tag text-xs uppercase tracking-[0.4em] ${accentText[accent]}`}>
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl text-ivory">{title}</h1>
          <p className="mt-2 text-sm text-paper/70">{subtitle}</p>
        </div>

        <div className="rounded-lg border border-line bg-panel/90 p-6 shadow-card">
          {children}
        </div>
      </div>
    </div>
  );
}
