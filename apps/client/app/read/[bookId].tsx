/**
 * Deep-link entry point (OVERNIGHT-2.md Lane A): `/read/<bookId>` must work
 * cold on the static host, for a learner who never went through onboarding.
 *
 * - Already onboarded: straight through to the reader, no extra work.
 * - Not onboarded: resolve the book's pack locale from the packs index,
 *   silently apply the A1 fast-path defaults for *that* locale (skips the
 *   wizard entirely — this is a link someone was handed, not a first
 *   visit to the home screen), then continue into the reader.
 * - Unknown bookId (bad link, or packs failed to load): fall back to
 *   onboarding/home rather than getting stuck on a blank screen.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { mergeReaderHandoffPreferences, parseReaderHandoff } from '../../src/cloud/paidJourney';
import { setUiCatalog } from '../../src/i18n/useT';
import { usePreferences } from '../../src/ui/data';
import { useTheme } from '../../src/ui/theme';
import { useSottoStore } from '../../src/state/store';
import { detectBrowserLanguage, fastPathDefaultsFor } from '../../src/onboarding/fastPathDefaults';

export default function ReadDeepLinkScreen() {
  const params = useLocalSearchParams<{
    bookId: string;
    learning?: string | string[];
    interface?: string | string[];
    explain?: string | string[];
    level?: string | string[];
    chapter?: string | string[];
    token?: string | string[];
    to?: string | string[];
  }>();
  const { bookId } = params;
  const id = typeof bookId === 'string' ? bookId : '';
  const handoff = parseReaderHandoff(id, params);
  const carriesHandoff = Boolean(
    handoff.learningLocale ||
    handoff.interfaceLocale ||
    handoff.explanationLocale ||
    handoff.level ||
    handoff.chapterId ||
    handoff.openTutor,
  );
  const [handoffApplied, setHandoffApplied] = useState(!carriesHandoff);
  const preferences = usePreferences();
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const setPreferences = useSottoStore((s) => s.setPreferences);
  const setProgress = useSottoStore((s) => s.setProgress);
  const { colors } = useTheme();

  useEffect(() => {
    if ((!preferences.onboarded || carriesHandoff) && packsStatus === 'idle') void loadPacks();
  }, [preferences.onboarded, carriesHandoff, packsStatus, loadPacks]);

  const locale = packsStatus === 'ready' ? bookLocale(id) : undefined;

  useEffect(() => {
    if (!locale || (preferences.onboarded && (!carriesHandoff || handoffApplied))) return;
    const defaults = fastPathDefaultsFor(detectBrowserLanguage());
    const merged = mergeReaderHandoffPreferences({
      current: {
        onboarded: preferences.onboarded,
        learningLocale: preferences.learningLocale,
        interfaceLocale: preferences.interfaceLocale,
        explanationLocale: preferences.explanationLocale,
        level: preferences.level,
      },
      defaults,
      handoff: {
        learningLocale: handoff.learningLocale,
        interfaceLocale: handoff.interfaceLocale,
        explanationLocale: handoff.explanationLocale,
        level: handoff.level,
        chapterId: handoff.chapterId,
        tokenId: handoff.tokenId,
        openTutor: handoff.openTutor,
      },
      bookLocale: locale,
    });
    setPreferences({
      ...merged,
      onboarded: true,
    });
    if (handoff.chapterId) {
      setProgress({
        bookId: id,
        chapterId: handoff.chapterId,
        ...(handoff.tokenId ? { tokenId: handoff.tokenId } : {}),
        audioPositionMs: 0,
        percentComplete: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    setUiCatalog(merged.interfaceLocale);
    setHandoffApplied(true);
  }, [
    preferences.onboarded,
    preferences.learningLocale,
    preferences.interfaceLocale,
    preferences.explanationLocale,
    preferences.level,
    carriesHandoff,
    handoffApplied,
    handoff.interfaceLocale,
    handoff.explanationLocale,
    handoff.learningLocale,
    handoff.level,
    handoff.chapterId,
    handoff.tokenId,
    handoff.openTutor,
    locale,
    id,
    setPreferences,
    setProgress,
  ]);

  if (preferences.onboarded && (!carriesHandoff || handoffApplied)) {
    return <Redirect href={handoff.openTutor ? `/voice/${id}?mode=discuss` : `/reader/${id}`} />;
  }

  if (packsStatus === 'error' || (packsStatus === 'ready' && !locale)) {
    return <Redirect href="/onboarding" />;
  }

  // Still resolving packs / applying fast-path defaults — a beat before
  // `preferences.onboarded` flips true and the redirect above fires.
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
