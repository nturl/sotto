/**
 * Lazy per-chapter narration for a private book (planning/LEDGER.md
 * "R3-I Importer" bullet 1: "lazy narration ... apps/client/src/import/**").
 * Not wired into apps/client/app/reader/[bookId].tsx from this lane — the
 * task brief requires the reader screen to work unchanged with private
 * books, so the actual call-on-chapter-switch integration is left for
 * whichever lane owns that file. This hook is the ready-to-use piece.
 */
import { useCallback, useState } from 'react';
import type { Chapter } from '@sotto/core';
import { fetchImportAudio, fetchImportResult, requestLazyNarration } from './api';
import { getImportJobId } from './lazyNarrationRegistry';
import { storeAudioAsset } from './privateAudio';
import { useSottoStore } from '../state/store';

export interface UseLazyNarrationResult {
  narrating: boolean;
  /** Narrates one chapter of a private book still tracked by a live
   * server-side import job (see lazyNarrationRegistry.ts's caveats).
   * Returns true when narration actually happened and the store now has
   * the updated chapter + audio; false when there was nothing to do
   * (already narrated, no Kokoro voice for the locale, or the original
   * job is no longer available). */
  narrateChapter: (bookId: string, chapterIndex: number) => Promise<boolean>;
}

export function useLazyNarration(): UseLazyNarrationResult {
  const [narrating, setNarrating] = useState(false);
  const addPrivateBook = useSottoStore((s) => s.addPrivateBook);

  const narrateChapter = useCallback(
    async (bookId: string, chapterIndex: number): Promise<boolean> => {
      const jobId = getImportJobId(bookId);
      if (!jobId) return false;
      setNarrating(true);
      try {
        const narrated = await requestLazyNarration(jobId, chapterIndex);
        if (!narrated) return false;
        const result = await fetchImportResult(jobId);
        if (!result) return false;
        const book = result.book as Parameters<typeof addPrivateBook>[0];
        const chapters = result.chapters as Chapter[];
        const chapterSummary = book.chapters[chapterIndex];
        if (chapterSummary?.audio) {
          const file = chapterSummary.audio.replace('audio/', '');
          const bytes = await fetchImportAudio(jobId, file);
          if (bytes) await storeAudioAsset(bookId, file, bytes);
        }
        await addPrivateBook(book, chapters);
        return true;
      } finally {
        setNarrating(false);
      }
    },
    [addPrivateBook],
  );

  return { narrating, narrateChapter };
}
