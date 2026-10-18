import Link from "next/link";

/** A pair of chopsticks with cyan tips. */
export function LogoMark({ size = 22, invert = false }: { size?: number; invert?: boolean }) {
  const bg = invert ? "#fcfcfc" : "#141518";
  const fg = invert ? "#141518" : "#fcfcfc";
  const tip = invert ? "#4ed3cf" : "#25fff9";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill={bg} />
      <path d="M23.02 4.62L6.41 22.01L7.39 22.99L24.78 6.38ZM25.02 8.62L8.41 26.01L9.39 26.99L26.78 10.38Z" fill={fg} />
      <path d="M9.33 18.73L6.41 22.01L7.39 22.99L10.67 20.07ZM11.33 22.73L8.41 26.01L9.39 26.99L12.67 24.07Z" fill={tip} />
    </svg>
  );
}

export function Logo({ href = "/", invert = false }: { href?: string; invert?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Omakaze home">
      <LogoMark invert={invert} />
      <span
        className={`font-serif text-[19px] leading-none tracking-[-0.02em] ${invert ? "text-white" : "text-black"}`}
      >
        Omakaze
      </span>
    </Link>
  );
}
