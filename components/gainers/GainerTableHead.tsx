import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Columns hidden below `sm:`. The screener's eight columns need ~780px of
 *  table against ~327px of phone viewport, so Price and Change — the entire
 *  point of the screener — used to sit off-screen behind a horizontal swipe
 *  with no affordance. Dropping the four contextual columns fits the four that
 *  matter, the same trick <TopFive> already uses on the landing page.
 *
 *  Exported so <GainerRow> applies the identical classes to its cells: a
 *  <thead> and <tbody> that disagree about which columns exist misaligns the
 *  whole table, and these two files being separate is exactly how that
 *  happens. */
export const SECONDARY_COL = "hidden sm:table-cell";

/** The day-range meter column. Two breakpoints later than SECONDARY_COL,
 *  measured rather than guessed: the other eight columns already need ~800px,
 *  so a ~150px ninth overflowed the table at `md` (982px in a 718px box) and
 *  still by 8px at 1024 with the full-width meter. Below `lg` the meter rides
 *  under the ticker instead (the mini variant in <GainerRow>), so phones and
 *  tablets keep it without the column. Same head/row agreement rule as above. */
export const RANGE_COL = "hidden lg:table-cell";

/** Column count at full width, for empty-state `colSpan`s. */
export const GAINER_COLUMNS = 9;

/** The screener/history table header. One definition, because both tables
 *  render the same <GainerRow> and must therefore declare the same columns.
 *
 *  `showRange` drops the Day range column, and must be passed identically to
 *  every <GainerRow> in the same table. History turns it off for sessions
 *  stored before the range columns existed (everything up to 2026-09-25):
 *  a whole column of empty tracks on a day that can never be backfilled. */
export function GainerTableHead({ showRange = true }: { showRange?: boolean } = {}) {
  return (
    <TableHeader>
      <TableRow className="border-foreground/10 hover:bg-transparent">
        <TableHead className="w-10 sm:w-16">#</TableHead>
        <TableHead>Ticker</TableHead>
        <TableHead className={SECONDARY_COL}>Company</TableHead>
        {/* Centered, with the meter centered to match (GainerRow): at wide
            widths the table stretches this cell past the meter's fixed width,
            so left-aligning both left the heading over the low end only. */}
        {showRange && (
          <TableHead className={`${RANGE_COL} text-center`}>Day range</TableHead>
        )}
        <TableHead className="text-right">Price</TableHead>
        {/* Extra left padding so Price and Change read as two figures, not one
            run of digits — the table stretches to fit, so shrinking another
            column spreads the freed space across all nine and barely moves
            this gap. From `lg` only, where the Day range column exists: below
            it the gap is already wide, and at `md` the table already overflows
            its box. Mirrored on the cell in <GainerRow>. */}
        <TableHead className="text-right lg:pl-5">Change</TableHead>
        <TableHead className={`${SECONDARY_COL} text-right`}>
          Market Cap
        </TableHead>
        <TableHead className={`${SECONDARY_COL} text-right`}>Rel. Vol</TableHead>
        <TableHead className={SECONDARY_COL}>Sector</TableHead>
      </TableRow>
    </TableHeader>
  );
}
