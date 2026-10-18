import Image from "next/image";
import Link from "next/link";

/** Wooden chopsticks with lacquered ends: public/logo.svg, or public/logo-light.svg on dark backgrounds. */
export function LogoMark({ size = 26, invert = false }: { size?: number; invert?: boolean }) {
  return (
    <Image
      src={invert ? "/logo-light.svg" : "/logo.svg"}
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
      <LogoMark invert={invert} />
      <span
        className={`font-serif text-[19px] leading-none tracking-[-0.02em] ${invert ? "text-white" : "text-black"}`}
      >
        Omakaze
      </span>
    </Link>
  );
}
