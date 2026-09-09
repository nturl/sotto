import { describe, expect, it } from 'vitest';
import { resolveSheetDrag, sheetDragOffset } from './sheetDrag';

describe('sheet drag', () => {
  it('follows only a downward handle drag', () => {
    expect(sheetDragOffset(-24)).toBe(0);
    expect(sheetDragOffset(86)).toBe(86);
  });

  it('collapses after a deliberate downward drag', () => {
    expect(resolveSheetDrag({ distance: 120, cancelled: false, reducedMotion: false })).toEqual({
      action: 'dismiss',
      animated: true,
    });
  });

  it('snaps a short drag back to the open definition', () => {
    expect(resolveSheetDrag({ distance: 119, cancelled: false, reducedMotion: false })).toEqual({
      action: 'restore',
      animated: true,
    });
  });

  it('restores the definition when the responder is cancelled', () => {
    expect(resolveSheetDrag({ distance: 240, cancelled: true, reducedMotion: false })).toEqual({
      action: 'restore',
      animated: true,
    });
  });

  it('settles immediately when reduced motion is enabled', () => {
    expect(resolveSheetDrag({ distance: 120, cancelled: false, reducedMotion: true })).toEqual({
      action: 'dismiss',
      animated: false,
    });
  });
});
