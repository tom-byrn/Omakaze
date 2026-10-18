import clsx from "clsx";
import { NOTES, type NoteName } from "./notes";

/**
 * A faint vertical line of Japanese in a section's side margin. Decorative: hidden from assistive
 * technology and below the `lg` breakpoint. The parent must be positioned.
 */
export function SideNote({ note, side, className }: { note: NoteName; side: "left" | "right"; className?: string }) {
  const { ja, romaji, en } = NOTES[note];
  return (
    <div
      aria-hidden="true"
      title={`${romaji}: ${en}`}
      className={clsx("side-note", side === "left" ? "left-7" : "right-7", className ?? "top-24")}
    >
      <span lang="ja" className="side-note-text">
        {ja}
      </span>
      <span className="side-note-rule" />
    </div>
  );
}
