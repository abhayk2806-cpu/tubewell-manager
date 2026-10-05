# Tubewell Manager — Business Knowledge

> **Last Updated: 2026-10-05**
> Implementation-independent: what the business is and how the owner talks about it. Calculation rules live only in [docs/LEDGER_AND_ALLOCATION.md](docs/LEDGER_AND_ALLOCATION.md).

## What the business is

- The owner's family runs a shared tubewell (pump) in India and sells irrigation water to local farmers by running time.
- The app replaces the paper notebook (*hisaab ki copy*) where every run and every payment used to be written down.
- Farmers settle in person, often irregularly. They may pay less than they owe, pay exactly, or pay ahead (advance).
- The data is the source of truth for those in-person settlements. **Accuracy matters more than features.**

Not a SaaS. No money moves through the app. Running cost target: ₹0 (Supabase and Netlify free tiers).

## Who uses it

- **One user: the owner.** There are no family accounts, no roles, and no "entry by" display.
- Mostly used on an Android phone, sometimes on desktop. Designed mobile-first.
- Farmers never use the app.

## Rate model

- Water is charged by running time: **amount = time × rate per hour**. The default rate is ₹100/hour.
- The rate is recorded on each entry, so a future rate change never rewrites old entries.
- Exact rounding is defined in the ledger spec (L2).

## How money is understood

- Each farmer has one continuous account (*hisaab*).
- Usage creates **charges**. Charges are grouped by calendar month (Asia/Kolkata) into **monthly buckets**.
- A **payment** is just money received on a date. The owner does not say which month it is for.
- The app **allocates** each payment automatically to the oldest unpaid month first (FIFO).
- Money paid beyond everything owed becomes **credit / advance**. It is never lost and is used automatically against later usage.
- One farmer's credit never reduces another farmer's due.

## Terminology

| Term (use these words) | Meaning |
|---|---|
| **Kisan** / Farmer | The person buying water |
| **Pani Entry** | One recorded run: date and time, hours, minutes, rate |
| **Charge** | The rupee amount created by usage |
| **Monthly bucket** | One farmer's total charge for one IST calendar month |
| **Paisa** / Payment | Money received from a farmer on a date |
| **Allocation** | The automatic FIFO split of payments across monthly buckets (never chosen by hand) |
| **Credit / Advance** | Paid beyond total charges; carried forward |
| **Outstanding / Baki** | Total still owed across all months |
| **Hisaab** | The farmer's running account |
| **Cash Mila** | Cash received in a period (payments dated in it) |
| **Charge Clear** | How much of a month's charge has been settled. Different from Cash Mila. |
| **Active farmer** | Not disabled and not deleted. Only active farmers count anywhere. |

## Voice and labels (Hinglish)

- Hinglish, as the family actually speaks. Not formal Hindi, not corporate English. Direct and friendly.
- **Labels that carry over from v1:** "Kisan", "Pani Entry karo", "Paisa Add karo", "Kitna Baki Hai", "Hisaab".
- **New labels:**
  - "Cash Mila (is mahine)" for cash received;
  - "Charge Clear (is mahine ka)" for charge settled;
  - "Advance / Credit".

Full copy rules: [.claude/rules/ui-copy-hinglish.md](.claude/rules/ui-copy-hinglish.md).

## Business rules (summary — details in the ledger spec)

- Record every run and every payment as its own row. Totals are always computed, never typed in.
- Mistakes are fixed by editing or soft-deleting a row. Nothing is ever erased (Restore exists).
- Possible duplicate entries trigger a warning, but the owner can still save. Two genuine identical payments on the same day happen.
- A disabled or deleted farmer drops out of every list and total but keeps their history. Restoring brings them back.

## Superseded v1 terms (do not use)

| v1 term | What replaced it |
|---|---|
| `for_month` / "Kis month ke liye?" | Payments have no month. FIFO allocation is automatic. |
| Allocation by hand / multi-month payment (`payment_group_id`) | Automatic FIFO allocation |
| Month Close ("hisaab close karo") | Removed. Settled / Partial / Unpaid is derived per month. |
| WhatsApp notifications | Out of scope for the rebuild |
| ₹0 cap per month (overpayment lost) | Credit carried forward |

History of v1: [archive/v1-2026-10/BUSINESS_KNOWLEDGE.md](archive/v1-2026-10/BUSINESS_KNOWLEDGE.md).

## Business Evolution Log

- **2026-04:** v1 built and live (React + Supabase + Netlify). Month allocation by hand.
- **2026-05:** v1 added WhatsApp click-to-send, multi-month payments and a farmer detail page.
- **2026-10-04:** owner decided on a full rebuild around a continuous ledger with FIFO allocation and credit. New Supabase project created.
- **2026-10-05:** scope fixed:
  - single user;
  - no WhatsApp;
  - no Month Close;
  - no data migration (owner re-enters data after the new system is approved);
  - soft-delete everywhere;
  - Asia/Kolkata time.
