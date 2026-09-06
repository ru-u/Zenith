import { TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SECONDARY_COL } from "./GainerTableHead";

/** A loading row shaped like a real <GainerRow>, cell for cell.
 *
 *  This replaced a single `<TableCell colSpan={8}>` bar, which was a
 *  mobile-only layout bug rather than a cosmetic shortcut: below `sm:` the four
 *  SECONDARY_COL cells are `display: none` and so leave the table model
 *  entirely, but a colSpan of 8 *defines* eight columns regardless. The
 *  skeleton therefore rendered a table twice as wide as the one that replaced
 *  it, and every column snapped when the real rows mounted.
 *
 *  Mirroring the cells also makes the handoff a fill-in instead of a swap —
 *  which is the difference between a skeleton that reads as loading and one
 *  that reads as broken. Bar widths approximate the real content so the
 *  columns settle at roughly their final size. */
export function GainerRowSkeleton() {
  return (
    <TableRow className="border-foreground/5 hover:bg-transparent">
      <TableCell>
        <Skeleton className="h-4 w-4 bg-foreground/5" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-12 bg-foreground/5" />
      </TableCell>
      <TableCell className={SECONDARY_COL}>
        <Skeleton className="h-4 w-36 bg-foreground/5" />
      </TableCell>
      <TableCell>
        <Skeleton className="ml-auto h-4 w-14 bg-foreground/5" />
      </TableCell>
      <TableCell>
        <Skeleton className="ml-auto h-4 w-16 bg-foreground/5" />
      </TableCell>
      <TableCell className={SECONDARY_COL}>
        <Skeleton className="ml-auto h-4 w-16 bg-foreground/5" />
      </TableCell>
      <TableCell className={SECONDARY_COL}>
        <Skeleton className="ml-auto h-4 w-12 bg-foreground/5" />
      </TableCell>
      <TableCell className={cn(SECONDARY_COL, "w-40")}>
        <Skeleton className="h-4 w-24 bg-foreground/5" />
      </TableCell>
    </TableRow>
  );
}
