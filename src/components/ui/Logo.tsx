import Link from "next/link";

export function LogoMark({ size = 22, invert = false }: { size?: number; invert?: boolean }) {
  const bg = invert ? "#fcfcfc" : "#141518";
  const fg = invert ? "#141518" : "#fcfcfc";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill={bg} />
      <path d="M9 8h9a5 5 0 0 1 0 10h-5v6" fill="none" stroke={fg} strokeWidth="2" />
      <path d="M13 13h5" stroke="#25fff9" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ href = "/", invert = false }: { href?: string; invert?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Guided PRs home">
      <LogoMark invert={invert} />
      <span
        className={`font-serif text-[19px] leading-none tracking-[-0.02em] ${invert ? "text-white" : "text-black"}`}
      >
        Guided PRs
      </span>
    </Link>
  );
}
