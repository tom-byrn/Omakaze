import Link from "next/link";
import type { FormState } from "@/components/ui/ActionForm";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { formatDate, timeAgo } from "@/lib/format";

export type ShareLinkRow = {
  id: string;
  /** null for a link to the latest version. */
  version: number | null;
  includeComments: boolean;
  creatorName: string | null;
  repoFullName: string;
  prNumber: number;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  /** Bound server action; missing when the viewer can't revoke the link. */
  revoke?: () => Promise<FormState>;
};

/** Active share links, in the guide's share dialog and on Settings → Share links. */
export function ShareLinkList({ links, slug, showPull = false }: { links: ShareLinkRow[]; slug: string; showPull?: boolean }) {
  if (links.length === 0) return <p className="text-[13px] text-muted">No active links.</p>;
  return (
    <ul aria-label="Active share links">
      {links.map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-3 border-t border-dashed border-line py-3 first:border-t-0" data-share-link={l.id}>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[14px] text-ink">
              {showPull ? (
                <Link href={`/w/${slug}/${l.repoFullName}/pull/${l.prNumber}`} className="mr-1 font-mono text-[12px] hover:underline">
                  {l.repoFullName}#{l.prNumber}
                </Link>
              ) : null}
              <span className="tag">{l.version === null ? "Latest version" : `v${l.version}`}</span>
              {l.includeComments ? <span className="tag">With comments</span> : null}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-[16px] text-meta">
              {l.creatorName ?? "Former member"} · created {formatDate(l.createdAt)} · {l.expiresAt ? `expires ${formatDate(l.expiresAt)}` : "never expires"} ·{" "}
              {l.lastUsedAt ? `last opened ${timeAgo(l.lastUsedAt)}` : "never opened"}
            </p>
          </div>
          {l.revoke ? (
            <ConfirmButton action={l.revoke} confirm="Revoke this link? Anyone who has it can no longer open the guide." pendingText="Revoking…">
              Revoke
            </ConfirmButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
