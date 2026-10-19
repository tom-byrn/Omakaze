import type { EmailBlocker } from "@/lib/notifications/recipients";

/** A checkbox with a label and a line of help, separated from the next by a dashed rule. */
export function CheckRow({
  name,
  value,
  label,
  help,
  defaultChecked,
  disabled,
}: {
  name: string;
  value?: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-t border-dashed border-line py-3.5 first:border-t-0 has-[:disabled]:cursor-not-allowed">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 h-4 w-4 shrink-0 accent-[#141518]" />
      <span className="min-w-0">
        <span className="block text-[14px] text-ink">{label}</span>
        {help ? <span className="block text-[13px] leading-[20px] text-body">{help}</span> : null}
      </span>
    </label>
  );
}

/** Why email notifications are off, in the words the settings show. */
export function blockerText(blocker: EmailBlocker, email: string | null): string {
  switch (blocker) {
    case "instance":
      return "Notifications are turned off on this instance (NOTIFICATIONS_ENABLED=false).";
    case "smtp":
      return "Email notifications are off: this instance has no SMTP server configured. An instance admin can set SMTP_URL to turn them on.";
    case "no_email":
      return "Add an email address to your profile to get email notifications.";
    case "unverified":
      return `Confirm ${email} to get email notifications.`;
  }
}

/** A dashed note: highlighted when something blocks email, quiet otherwise. */
export function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "warn" ? "note" : undefined}
      className={
        tone === "warn"
          ? "border border-dashed border-highlight bg-highlight/10 px-3 py-2 text-[13px] leading-[20px] text-ink"
          : "border border-dashed border-line bg-paper px-3 py-2 text-[13px] leading-[20px] text-body"
      }
    >
      {children}
    </div>
  );
}
