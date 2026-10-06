import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { istDateKey, parseInstantMs } from '@/lib/ledger';
import type { FarmerRow } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { FARMERS_COPY, type FarmerSegment } from './copy';

const ACTIONS = FARMERS_COPY.actions;

export interface FarmerListItemProps {
  readonly farmer: FarmerRow;
  readonly segment: FarmerSegment;
  /** True while any change is being saved: every button is disabled (no double submit). */
  readonly busy: boolean;
  onEdit(farmer: FarmerRow): void;
  onSetDisabled(farmer: FarmerRow, disabled: boolean): void;
  onDelete(farmer: FarmerRow): void;
  onRestore(farmer: FarmerRow): void;
}

/** One farmer in the list: name, mobile, notes and the actions of its segment. No money is shown here. */
export function FarmerListItem({ farmer, segment, busy, onEdit, onSetDisabled, onDelete, onRestore }: FarmerListItemProps) {
  const buttonClass = 'h-11 min-w-11';
  return (
    <li className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="min-w-0">
        {segment === 'deleted' ? (
          <p className="break-words font-medium">{farmer.name}</p>
        ) : (
          // Opens Kisan ka Hisaab; a deleted farmer has no profile (it would show "Kisan nahi mila").
          <Link
            to={`/farmers/${farmer.id}`}
            className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-md px-1 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={FARMERS_COPY.openProfile(farmer.name)}
          >
            <span className="break-words">
              {farmer.name}
              {segment === 'disabled' && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{FARMERS_COPY.disabledBadge}</span>
              )}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          </Link>
        )}
        {farmer.mobile && <p className="text-sm text-muted-foreground">{farmer.mobile}</p>}
        {farmer.notes && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{farmer.notes}</p>}
        {segment === 'deleted' && farmer.deleted_at !== null && (
          <p className="text-sm text-muted-foreground">{FARMERS_COPY.deletedOn(istDateKey(parseInstantMs(farmer.deleted_at)))}</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {segment === 'deleted' ? (
          <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onRestore(farmer)}>
            {ACTIONS.restore}
          </Button>
        ) : (
          <>
            <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onEdit(farmer)}>
              {ACTIONS.edit}
            </Button>
            <Button
              variant="outline"
              className={buttonClass}
              disabled={busy}
              onClick={() => onSetDisabled(farmer, segment === 'active')}
            >
              {segment === 'active' ? ACTIONS.disable : ACTIONS.enable}
            </Button>
            <Button variant="outline" className={`${buttonClass} text-destructive`} disabled={busy} onClick={() => onDelete(farmer)}>
              {ACTIONS.delete}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
