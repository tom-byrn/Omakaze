import { ChatgptLogo } from "@/components/ui/ChatgptLogo";
import { MANAGE_USAGE_URL } from "@/lib/ai/chatgpt-links";

/** Shown wherever a request will use the user's ChatGPT plan, as Sign in with ChatGPT requires. */
export function ChatgptPlanBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <ChatgptLogo size={12} />
      Using ChatGPT plan
      <span aria-hidden="true">·</span>
      <a href={MANAGE_USAGE_URL} target="_blank" rel="noreferrer" className="link">
        Manage usage
      </a>
    </span>
  );
}
