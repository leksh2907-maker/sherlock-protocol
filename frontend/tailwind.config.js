/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050A0F",
        panel: "#0B131B",
        line: "#1B2A33",
        green: "#58D68D",
        cyan: "#25D9D2",
        gold: "#E7B93C",
        red: "#E84C4C",
        paper: "#D8C79E",
        ivory: "#F3F0E6",
      },
      fontFamily: {
        display: ["'Special Elite'", "cursive"],
        mono: ["'JetBrains Mono'", "monospace"],
        body: ["'Inter'", "sans-serif"],
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(37,217,210,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,217,210,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "36px 36px",
      },
      boxShadow: {
        card: "0 0 0 1px rgba(88,214,141,0.15), 0 12px 30px -10px rgba(0,0,0,0.7)",
        glowGreen: "0 0 18px rgba(88,214,141,0.35)",
        glowCyan: "0 0 18px rgba(37,217,210,0.35)",
        glowRed: "0 0 18px rgba(232,76,76,0.35)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        flicker: {
          "0%, 100%": { opacity: 1 },
          "45%": { opacity: 1 },
          "46%": { opacity: 0.4 },
          "47%": { opacity: 1 },
          "72%": { opacity: 1 },
          "73%": { opacity: 0.5 },
          "74%": { opacity: 1 },
        },
        dash: {
          to: { strokeDashoffset: -24 },
        },
        fadeUp: {
          "0%": { opacity: 0, transform: "translateY(14px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        scan: "scan 6s linear infinite",
        flicker: "flicker 5s linear infinite",
        dash: "dash 1.2s linear infinite",
        fadeUp: "fadeUp 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
