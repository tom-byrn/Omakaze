import clsx from "clsx";
import Image from "next/image";

/* Decorative chopsticks drawn from the logo (public/chopstick.svg, public/logo.svg). Hidden from assistive technology. */

/** One chopstick lying flat, tip at the left. `width` is its length in px. */
function Chopstick({ width, className }: { width: number; className?: string }) {
  // The SVG is 71×10, so the height follows from the length.
  return <Image src="/chopstick.svg" alt="" width={width} height={Math.round((width * 10) / 71)} className={clsx("block max-w-none", className)} />;
}

/** A pair of chopsticks on a ceramic rest, laid across a section border. The parent must be positioned. */
export function ChopstickDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={clsx("pointer-events-none absolute left-1/2 z-10 h-[82px] w-[420px] -translate-x-1/2", className)}>
      <Image src="/chopstick-rest.svg" alt="" width={74} height={27} className="absolute top-[27px] left-[52px] max-w-none rotate-90" />
      <div className="absolute inset-0 -rotate-[1.5deg]">
        <Chopstick width={414} className="absolute -top-[7px] left-0" />
        <Chopstick width={414} className="absolute top-[27px] left-[13px] -rotate-[1.2deg]" />
      </div>
    </div>
  );
}

/** The logo's crossed chopsticks at display size. */
export function CrossedChopsticks({ className }: { className?: string }) {
  return <Image src="/logo.svg" alt="" aria-hidden="true" width={330} height={330} className={clsx("pointer-events-none max-w-none rotate-[8deg]", className)} />;
}
