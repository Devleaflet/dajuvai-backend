/**
 * The merchandising sort contract: pinned DESC, displayOrder ASC, id ASC.
 *
 * Public reads apply this in SQL (ORDER BY "pinned" DESC, "displayOrder" ASC,
 * "id" ASC). The admin list merges assigned and unassigned rows in memory and
 * applies it here. Both must agree — merchandising.dbcheck.ts asserts they do.
 */
export interface SortablePlacementRow {
    id: number;
    displayOrder: number;
    pinned: boolean;
}

export const comparePlacementRows = (a: SortablePlacementRow, b: SortablePlacementRow): number => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.id - b.id;
};

/** Sorts by the contract. Returns a new array; never mutates the input. */
export const sortPlacementRows = <T extends SortablePlacementRow>(rows: T[]): T[] =>
    [...rows].sort(comparePlacementRows);
