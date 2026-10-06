import { formatRupees } from '@/lib/ledger';
import type { FarmerBalance } from '@/lib/data';
import { MONEY_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { FARMERS_COPY } from './copy';

const C = FARMERS_COPY.balance;

/**
 * A farmer's current position (D32): "Abhi baaki" (due) or "Baaki nahi" (muted), plus a separate
 * "Advance / Credit" badge when credit > 0. Both figures come from buildFarmerBalances (the engine);
 * they are never combined. Used by the Kisan list and the Pani screen.
 */
export function BalanceLine({ balance, testId }: { balance: FarmerBalance | undefined; testId?: string }) {
  if (balance === undefined) return null;
  if (!balance.ok) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={testId}>
        {C.badData}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid={testId}>
      {balance.outstandingPaise > 0 ? (
        <span data-testid="balance-outstanding">
          <span className="text-muted-foreground">{C.outstanding} </span>
          <span className={cn('font-semibold', TONE[MONEY_TONE.outstanding].text)}>{formatRupees(balance.outstandingPaise)}</span>
        </span>
      ) : (
        <span className={TONE.muted.text} data-testid="balance-none">
          {C.none}
        </span>
      )}
      {balance.creditPaise > 0 && (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE[MONEY_TONE.credit].badge)} data-testid="balance-credit">
          {C.credit} {formatRupees(balance.creditPaise)}
        </span>
      )}
    </div>
  );
}
