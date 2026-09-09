/** A purposeful pull, rather than a finger settling on the handle. */
export const SHEET_DISMISS_DISTANCE = 120;

export function sheetDragOffset(distance: number): number {
  return Math.max(0, distance);
}

export function resolveSheetDrag({
  distance,
  cancelled,
  reducedMotion,
}: {
  distance: number;
  cancelled: boolean;
  reducedMotion: boolean;
}): { action: 'dismiss' | 'restore'; animated: boolean } {
  return {
    action:
      !cancelled && sheetDragOffset(distance) >= SHEET_DISMISS_DISTANCE ? 'dismiss' : 'restore',
    animated: !reducedMotion,
  };
}
