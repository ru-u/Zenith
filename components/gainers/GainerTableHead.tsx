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

/** The screener/history table header. One definition, because both tables
 *  render the same <GainerRow> and must therefore declare the same columns. */
export function GainerTableHead() {
  return (
    <TableHeader>
      <TableRow className="border-foreground/10 hover:bg-transparent">
        <TableHead className="w-10 sm:w-16">#</TableHead>
        <TableHead>Ticker</TableHead>
        <TableHead className={SECONDARY_COL}>Company</TableHead>
        <TableHead className="text-right">Price</TableHead>
        <TableHead className="text-right">Change</TableHead>
        <TableHead className={`${SECONDARY_COL} text-right`}>
          Market Cap
        </TableHead>
        <TableHead className={`${SECONDARY_COL} text-right`}>Rel. Vol</TableHead>
        <TableHead className={SECONDARY_COL}>Sector</TableHead>
      </TableRow>
    </TableHeader>
  );
}
