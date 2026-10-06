import type { MonthStatus } from '@/lib/ledger';
import type { ProfileBalance, ProfileLedgerLine } from '@/lib/data';

/**
 * Semantic colour tones (D28). Every kind of information has ONE fixed tone, the same on every
 * screen (rules: .claude/rules/ui-color-semantics.md). Screens pick a tone through the lookups
 * below, never ad hoc, and every coloured item keeps its text label.
 */
export type Tone = 'water' | 'cash' | 'due' | 'credit' | 'caution' | 'info' | 'muted';

export interface ToneClasses {
  /** Coloured text (key amounts and labels). */
  readonly text: string;
  /** Soft tinted background. */
  readonly soft: string;
  /** Decorative border colour. */
  readonly border: string;
  /** Thin coloured left bar on a list row or card (entry type). */
  readonly bar: string;
  /** Small solid dot (entry type in a dense list). */
  readonly dot: string;
  /** Small badge: soft background plus coloured text. */
  readonly badge: string;
  /** Notice box: border, soft background and coloured text. */
  readonly notice: string;
}

// Complete literal class names only: Tailwind finds classes by scanning the source text.
export const TONE: Record<Tone, ToneClasses> = {
  water: {
    text: 'text-tone-water',
    soft: 'bg-tone-water-soft',
    border: 'border-tone-water-border',
    bar: 'border-l-4 border-l-tone-water',
    dot: 'bg-tone-water',
    badge: 'bg-tone-water-soft text-tone-water',
    notice: 'border-tone-water-border bg-tone-water-soft text-tone-water',
  },
  cash: {
    text: 'text-tone-cash',
    soft: 'bg-tone-cash-soft',
    border: 'border-tone-cash-border',
    bar: 'border-l-4 border-l-tone-cash',
    dot: 'bg-tone-cash',
    badge: 'bg-tone-cash-soft text-tone-cash',
    notice: 'border-tone-cash-border bg-tone-cash-soft text-tone-cash',
  },
  due: {
    text: 'text-tone-due',
    soft: 'bg-tone-due-soft',
    border: 'border-tone-due-border',
    bar: 'border-l-4 border-l-tone-due',
    dot: 'bg-tone-due',
    badge: 'bg-tone-due-soft text-tone-due',
    notice: 'border-tone-due-border bg-tone-due-soft text-tone-due',
  },
  credit: {
    text: 'text-tone-credit',
    soft: 'bg-tone-credit-soft',
    border: 'border-tone-credit-border',
    bar: 'border-l-4 border-l-tone-credit',
    dot: 'bg-tone-credit',
    badge: 'bg-tone-credit-soft text-tone-credit',
    notice: 'border-tone-credit-border bg-tone-credit-soft text-tone-credit',
  },
  caution: {
    text: 'text-tone-caution',
    soft: 'bg-tone-caution-soft',
    border: 'border-tone-caution-border',
    bar: 'border-l-4 border-l-tone-caution',
    dot: 'bg-tone-caution',
    badge: 'bg-tone-caution-soft text-tone-caution',
    notice: 'border-tone-caution-border bg-tone-caution-soft text-tone-caution',
  },
  // info and muted reuse the existing shadcn tokens unchanged.
  info: {
    text: 'text-primary',
    soft: 'bg-accent',
    border: 'border-primary/30',
    bar: 'border-l-4 border-l-primary',
    dot: 'bg-primary',
    badge: 'bg-accent text-accent-foreground',
    notice: 'border-primary/30 bg-accent text-accent-foreground',
  },
  muted: {
    text: 'text-muted-foreground',
    soft: 'bg-muted',
    border: 'border-border',
    bar: 'border-l-4 border-l-border',
    dot: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    notice: 'border-border bg-muted text-muted-foreground',
  },
};

/** Money figures by meaning; the Dashboard and Months screens use the same map (charts and legends too). */
export const MONEY_TONE = {
  charge: 'water',
  cash: 'cash',
  outstanding: 'due',
  credit: 'credit',
} as const satisfies Record<string, Tone>;

export const MONTH_STATUS_TONE: Record<MonthStatus, Tone> = {
  settled: 'cash',
  partial: 'caution',
  unpaid: 'due',
  payment_only: 'credit',
};

export const BALANCE_TONE: Record<ProfileBalance['kind'], Tone> = {
  baaki: 'due',
  advance: 'credit',
  zero: 'muted',
};

export const ENTRY_KIND_TONE: Record<ProfileLedgerLine['kind'], Tone> = {
  usage: 'water',
  payment: 'cash',
};

/** Notices: saved confirmations, duplicate / date / duration warnings, "saved but list not refreshed". */
export const NOTICE_TONE = {
  success: 'cash',
  warning: 'caution',
  refreshFailed: 'caution',
} as const satisfies Record<string, Tone>;
