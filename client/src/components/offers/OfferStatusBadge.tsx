import type { OfferStatus } from '@hearth/shared';

const LABELS: Record<OfferStatus, [label: string, tone: string]> = {
  submitted: ['Submitted', 'accent-soft'],
  countered: ['Countered', 'warning'],
  accepted: ['Accepted', 'success'],
  rejected: ['Not accepted', 'danger'],
  withdrawn: ['Withdrawn', 'muted'],
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const [label, tone] = LABELS[status];
  return <span className={`badge badge--dot badge--${tone}`}>{label}</span>;
}
