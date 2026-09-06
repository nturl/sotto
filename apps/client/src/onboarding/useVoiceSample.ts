/**
 * The narration slice behind onboarding's "listen to a sample" row.
 *
 * Lifted out of `app/onboarding/languages.tsx` unchanged (run 7 lane C) when
 * the wizard's three screens became one four-step screen: the hook is the
 * same, it just no longer lives in a route file.
 *
 * Loads the first sentence's audio slice of the first book in `locale`'s
 * pack, once packs are loaded. Returns `undefined` while still resolving and
 * `null` once resolution finished with nothing playable (no pack, no chapter,
 * or no timings for this locale).
 */
import { useEffect, useState } from 'react';
import { assetUrl, fetchBook, fetchChapter } from '../state/contentApi';
import { selectPackForLocale } from '../state/selectors';
import { useSottoStore } from '../state/store';

export type VoiceSample = { uri: string; startMs: number; endMs: number; text: string };

export function useVoiceSample(locale: string): VoiceSample | null | undefined {
  const packs = useSottoStore((s) => s.packs);
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);
  const [sample, setSample] = useState<VoiceSample | null | undefined>(undefined);

  useEffect(() => {
    if (packsStatus === 'idle') void loadPacks();
  }, [packsStatus, loadPacks]);

  useEffect(() => {
    let cancelled = false;
    setSample(undefined);

    if (packsStatus !== 'ready') return undefined;
    const summary = selectPackForLocale(packs, locale)?.books[0];
    if (!summary) {
      setSample(null);
      return undefined;
    }

    void (async () => {
      try {
        const book = await fetchBook(locale, summary.bookId);
        const chapterSummary = book.chapters[0];
        if (!chapterSummary?.audio) {
          if (!cancelled) setSample(null);
          return;
        }
        const chapter = await fetchChapter(locale, summary.bookId, chapterSummary.file);
        const firstSentence = chapter.blocks[0]?.sentences[0];
        const tokens = firstSentence?.tokens ?? [];
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        if (first?.startMs === undefined || last?.endMs === undefined) {
          if (!cancelled) setSample(null);
          return;
        }
        if (!cancelled) {
          setSample({
            uri: assetUrl(locale, summary.bookId, chapterSummary.audio),
            startMs: first.startMs,
            endMs: last.endMs,
            text: firstSentence?.text ?? '',
          });
        }
      } catch {
        if (!cancelled) setSample(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, packs, packsStatus]);

  return sample;
}
