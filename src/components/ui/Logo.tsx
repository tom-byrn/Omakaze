import Image from "next/image";
import Link from "next/link";

/** An illustration of wooden chopsticks (public/logo.svg). It works on light and dark backgrounds. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="eager"
    />
  );
}

export function Logo({ href = "/", invert = false }: { href?: string; invert?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Omakaze home">
      <LogoMark />
      <span
        className={`font-serif text-[19px] leading-none tracking-[-0.02em] ${invert ? "text-white" : "text-black"}`}
      >
        Omakaze
      </span>
    </Link>
  );
}
