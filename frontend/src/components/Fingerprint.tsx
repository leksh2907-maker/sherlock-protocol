interface FingerprintProps {
  className?: string;
}

export default function Fingerprint({ className = "" }: FingerprintProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M50 20 C30 20 20 35 20 52 C20 65 25 75 30 82" />
      <path d="M50 14 C25 14 12 33 12 54 C12 68 16 79 22 88" />
      <path d="M50 26 C36 26 28 38 28 52 C28 64 33 72 38 78" />
      <path d="M50 32 C42 32 36 41 36 52 C36 61 39 68 44 74" />
      <path d="M50 38 C46 38 44 44 44 52 C44 58 46 63 50 68" />
      <path d="M58 20 C74 22 82 36 82 52 C82 66 77 76 71 84" />
      <path d="M62 27 C73 30 78 40 78 52 C78 62 75 70 70 77" />
      <path d="M64 34 C71 37 74 43 74 52 C74 60 72 66 68 71" />
      <path d="M50 44 C52 44 54 47 54 52 C54 56 53 59 51 62" />
    </svg>
  );
}
