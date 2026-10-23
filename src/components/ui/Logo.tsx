import Image from "next/image";
import Link from "next/link";

/**
 * Crossed black-wood chopsticks on a transparent background (public/logo.svg), or the white
 * version (public/logo-white.svg) for dark surfaces, where the black one disappears.
 */
export function LogoMark({ size = 26, invert = false }: { size?: number; invert?: boolean }) {
  const image = (src: string, className?: string) => (
    <Image src={src} alt="" aria-hidden="true" width={size} height={size} loading="eager" className={className} />
  );
  if (invert) return image("/logo-white.svg");
  // The app's dark theme swaps to the white mark (globals.css).
  return (
    <>
      {image("/logo.svg", "logo-light")}
      {image("/logo-white.svg", "logo-dark")}
    </>
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
