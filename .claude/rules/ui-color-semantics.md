---
paths:
  - "src/pages/**"
  - "src/components/**"
---

# UI colour rules (semantic tones, D28)

Every kind of information has ONE fixed colour chosen by its meaning, the same on every screen. Colours stay calm and professional: never random, never a rainbow, never decoration without a meaning.

**Meaning map** (tones live in `src/components/tone.ts`; tokens in `src/index.css`):

| Tone | Meaning | Used for |
|---|---|---|
| `water` (teal) | Pani usage and its CHARGE | Pani entries, "Total charge", month "Charge", ledger lines of kind usage, the live amount on the Pani form |
| `cash` (green) | Money RECEIVED | Payments, "Total mila", "Cash Mila", "Charge Clear", ledger lines of kind payment, status "Settled", trail pieces, success notices |
| `due` (rose red) | Money STILL OWED | "Abhi baaki", month "Baaki", status "Unpaid", ledger balance "Baaki ₹x", the preview's outstanding figures |
| `credit` (violet) | ADVANCE / CREDIT | "Advance / Credit" figure and badge, the trail line "Advance / Credit", ledger balance "Advance ₹x", status "Sirf Payment", "naya Advance / Credit" |
| `caution` (amber) | Warnings, in-between states | Duplicate / future-date / long-duration warnings, status "Partial", the "saved, list not refreshed" notice |
| `info` (existing primary blue) | Neutral information and actions | Buttons, links, focus rings |
| `muted` (existing grey) | Inactive or zero | Band farmers, Deleted lists and rows, "Barabar", helper text |

- Errors (failed load or save, invalid input) keep the existing `destructive` style. `due` is NOT an error colour: money owed is not a failure.

**How to apply** (restrained):
- Coloured TEXT for key amounts and labels (`TONE[t].text`).
- A SOFT tinted background only for small badges and notice boxes (`TONE[t].badge`, `TONE[t].notice`).
- A thin coloured LEFT BAR (`TONE[t].bar`) or a small dot (`TONE[t].dot`) on list rows and cards to show the entry type. Cards and the page stay white / off-white.
- At most ONE tone per element. No large saturated fills, no gradients.
- Pick tones through the lookups (`MONEY_TONE`, `MONTH_STATUS_TONE`, `BALANCE_TONE`, `ENTRY_KIND_TONE`, `NOTICE_TONE`), never ad hoc per screen.

**Accessibility (mandatory):**
- Colour never carries meaning alone. Every coloured item keeps its text label (Baaki / Advance / Settled / ...).
- Each tone's text colour must reach a contrast of at least 4.5:1 on the card, on the page background and on its own soft background. `src/components/tone.test.ts` proves this from `index.css`. Change a token only together with a passing test.
- Border, bar and dot colours are decorative only.

**Forbidden in pages and components** (enforced by `tone.test.ts`):
- Raw hex colours, inline `style` colours, raw `rgb()` / `hsl()`.
- Tailwind default-palette classes such as `text-red-600` or `bg-green-100`. Use the `tone-*` and existing shadcn token classes only.

**Future screens.** The Dashboard, the Months screen and any chart or stat tile MUST use these same tones:
- charges = `water`, cash received = `cash`, outstanding = `due`, credit = `credit`;
- this applies to every chart series and legend as well;
- no new ad-hoc colours. If a new meaning is needed, add a named tone (token, contrast test, this file) first.
