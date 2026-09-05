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
import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { colors } from '@sotto/core/theme';
import { setUiCatalog } from '../../src/i18n/useT';
import { setPreference, usePreferences } from '../../src/ui/data';
import { useSottoStore } from '../../src/state/store';
import { detectBrowserLanguage, fastPathDefaultsFor } from '../../src/onboarding/fastPathDefaults';

export default function ReadDeepLinkScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const id = typeof bookId === 'string' ? bookId : '';
  const preferences = usePreferences();
  const packsStatus = useSottoStore((s) => s.packsStatus);
  const loadPacks = useSottoStore((s) => s.loadPacks);
  const bookLocale = useSottoStore((s) => s.bookLocale);

  useEffect(() => {
    if (!preferences.onboarded && packsStatus === 'idle') void loadPacks();
  }, [preferences.onboarded, packsStatus, loadPacks]);

  const locale = packsStatus === 'ready' ? bookLocale(id) : undefined;

  useEffect(() => {
    if (preferences.onboarded || !locale) return;
    const defaults = fastPathDefaultsFor(detectBrowserLanguage());
    setPreference('interfaceLocale', defaults.interfaceLocale);
    setPreference('explanationLocale', defaults.explanationLocale);
    setPreference('learningLocale', locale);
    setPreference('level', defaults.level);
    setPreference('onboarded', true);
    setUiCatalog(defaults.interfaceLocale);
  }, [preferences.onboarded, locale]);

  if (preferences.onboarded) return <Redirect href={`/reader/${id}`} />;

  if (packsStatus === 'error' || (packsStatus === 'ready' && !locale)) {
    return <Redirect href="/onboarding" />;
  }

  // Still resolving packs / applying fast-path defaults — a beat before
  // `preferences.onboarded` flips true and the redirect above fires.
  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
