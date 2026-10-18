export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path d="M7 15.5 16 8l9 7.5V25a1 1 0 0 1-1 1h-5.5v-6h-5v6H8a1 1 0 0 1-1-1z" fill="#fff" />
      <path d="M16 12.6c1.7 1.6 2.5 3 2.5 4.2a2.5 2.5 0 0 1-5 0c0-1.2.8-2.6 2.5-4.2z" fill="#f59e0b" />
    </svg>
  );
}
