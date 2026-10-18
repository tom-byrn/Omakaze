/* eslint-disable @next/next/no-img-element */
export function Avatar({ src, name, size = 24 }: { src?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        width={size}
        height={size}
        className="flex-none border border-black/10 bg-wash object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex flex-none items-center justify-center border border-black/15 bg-mist font-mono text-black/60"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
