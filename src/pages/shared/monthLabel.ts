// Display label for an IST month key, shared by the Pani Entry and Paisa screens.
// A label lookup only: the month key itself always comes from the engine (istMonthKey).

const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

/** "2026-10" -> "Oct 2026"; anything unexpected is shown as given. */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const name = MONTH_NAMES[month ?? ''];
  return name === undefined || year === undefined ? monthKey : `${name} ${year}`;
}
