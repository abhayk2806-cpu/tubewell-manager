-- Migration 005: farmers input checks (Phase 4A)
--
-- 1. farmers_name_not_blank (same name, new definition): a name is blank when nothing is left after
--    trimming ALL of these whitespace characters, not only spaces: space, tab (9), LF (10), VT (11),
--    FF (12), CR (13) and the no-break space U+00A0 (160). The old check used btrim(name), which
--    trims spaces only, so a tab-only name passed.
--    The characters are built with chr() so this file stays pure ASCII.
-- 2. Length limits, the same as the app's farmer form rules (src/lib/data/farmerRules.ts):
--    name at most 100 characters, mobile at most 20, notes at most 500. NULL mobile and notes stay allowed.
-- The table had 0 rows when this was applied (2026-10-06), so no existing row could conflict.

alter table public.farmers drop constraint farmers_name_not_blank;

alter table public.farmers
  add constraint farmers_name_not_blank
    check (btrim(name, chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160)) <> ''),
  add constraint farmers_name_max_length
    check (char_length(name) <= 100),
  add constraint farmers_mobile_max_length
    check (mobile is null or char_length(mobile) <= 20),
  add constraint farmers_notes_max_length
    check (notes is null or char_length(notes) <= 500);
