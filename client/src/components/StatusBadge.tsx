import { SALE_STATUS_LABELS, type SaleStatus } from '@hearth/shared';

const TONES: Record<SaleStatus, string> = { active: 'success', pending: 'warning', sold: 'muted' };

export function StatusBadge({ status }: { status: SaleStatus }) {
  return <span className={`badge badge--dot badge--${TONES[status]}`}>{SALE_STATUS_LABELS[status]}</span>;
}
