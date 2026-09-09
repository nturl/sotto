/**
 * Voice screen — DESIGN.md "Voice screen". CONTRACTS §6 route: /voice/[bookId].
 *
 * Redesigned for run7/F2 (planning/run7/cards/F2-voice-screen.md): a
 * conversation screen — passage card, scrollable transcript, one bottom
 * control cluster — replacing the old layout of a corner status dot, a
 * separate caption strip, and a dead-end "Enable push-to-talk in settings"
 * caption with nothing to press (see F2-report.md's step-0 log for why
 * that caption never actually contradicted the header: both read the same
 * `voiceState`; it's now a real in-place toggle regardless).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLanguage, type TutorMode } from '@sotto/core';
import { space } from '@sotto/core/theme';
import { modelsForTier, totalSizeMb } from '@sotto/voice';
import {
  buildPaidAccountUrl,
  buildPaidTrialUrl,
  paidJourneyState,
  type PaidReaderHandoff,
} from '../../src/cloud/paidJourney';
import { useCloud } from '../../src/cloud/provider';
import { usePaidAccess } from '../../src/cloud/paidAccess';
import { useTrialOffer } from '../../src/cloud/trialOffer';
import { useMe } from '../../src/cloud/useMe';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { CloseGlyph, SettingsGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import type { SpeechSentence } from '../../src/ui/SpeechFillText';
import { useLayoutMetrics } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { webPressFeedback } from '../../src/ui/webPressFeedback';
import { useSottoStore } from '../../src/state/store';
import { buildPassageWindow } from '../../src/voice/passage';
import { correctableCaptionId } from '../../src/voice/captionCorrection';
import { micPressAction } from '../../src/voice/micPress';
import { exitTutor } from '../../src/voice/exitTutor';
import { TutorModelsPanel, type TutorModelsPanelState } from '../../src/voice/TutorModelsPanel';
import { useOwnProviderStatus } from '../../src/voice/ownProviderStatus';
import { useVoiceSession } from '../../src/voice/useVoiceSession';
import { ControlCluster, type TurnDetection } from '../../src/voice/ui/ControlCluster';
import { PassageCard } from '../../src/voice/ui/PassageCard';
import { RecoveryView } from '../../src/voice/ui/RecoveryView';
import {
  needsRecovery,
  recoveryMessageFor,
  recoveryPanelFor,
} from '../../src/voice/ui/recoveryPanel';
import { TextFallback } from '../../src/voice/ui/TextFallback';
import { Transcript } from '../../src/voice/ui/Transcript';
import { TutorWordSheet } from '../../src/voice/ui/TutorWordSheet';
import {
  normalizeTranscriptWord,
  type TranscriptWordSegment,
} from '../../src/voice/transcriptVocabulary';

const MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

// ADVERSARIAL-REVIEW.md §1.9 / §3 row 28: SpeechFillText painted the whole
// passage `quiet` whenever no `reading` event had ever arrived — the
// permanent state in discuss/pronunciation and while just listening, since
// nothing is ever "read" there. Now the passage defaults to ink and only
// dims-then-fills while a reading event is actively in flight (for this
// window after the last one, or until the voice state changes).
const READING_ACTIVE_WINDOW_MS = 6000;

function openPaidClient(url: string, replace = false): void {
  const loc = (
    globalThis as { location?: { assign(url: string): void; replace(url: string): void } }
  ).location;
  if (Platform.OS === 'web' && loc) {
    if (replace) loc.replace(url);
    else loc.assign(url);
    return;
  }
  void Linking.openURL(url).catch(() => {});
}

/**
 * run10/B1 — the free build's Discuss gate. readsotto.app has no
 * CloudAdapter, so tapping "Talk about this passage" used to open straight
 * onto TutorModelsPanel: a tier picker, three model names and a 1.2 GB
 * download button, as the first thing a stranger sees on a screen the
 * landing page reached by selling a three-day trial the app never mentioned.
 *
 * It is now a decision list, cheapest commitment first: the trial, then the
 * in-browser tutor with its real cost stated, then an own key, then reading
 * alone. The model list is no longer the gate — it only appears once someone
 * has chosen the browser, and stays collapsed otherwise.
 */
function FreeTutorChoices({
  handoff,
  panelState,
  onChanged,
  onOwnKey,
  onReadAlone,
}: {
  handoff: PaidReaderHandoff;
  panelState: TutorModelsPanelState;
  onChanged: () => void;
  onOwnKey: () => void;
  onReadAlone: () => void;
}) {
  const t = useT();
  const { isDesktop } = useLayoutMetrics();
  const [showBrowser, setShowBrowser] = useState(false);
  const trialUrl = useMemo(() => buildPaidTrialUrl(handoff), [handoff]);
  const paidAccountUrl = useMemo(() => buildPaidAccountUrl(handoff), [handoff]);
  const paidAccess = usePaidAccess(Platform.OS === 'web');
  // The same numbers TutorModelsPanel prints for the standard tier, read
  // from the same helpers, so the caption can never quote a stale size.
  const browserSizeMb = useMemo(() => totalSizeMb(modelsForTier('standard')), []);
  // Trial length and prices come from the paid service's own plan table
  // (src/cloud/trialOffer.ts), falling back to today's numbers offline, so
  // this screen cannot go on quoting a price checkout no longer charges.
  const trial = useTrialOffer();

  useEffect(() => {
    if (paidAccess.status === 'subscribed') openPaidClient(paidAccountUrl, true);
  }, [paidAccess.status, paidAccountUrl]);

  if (paidAccess.status === 'checking' || paidAccess.status === 'subscribed') {
    return (
      <Text role="ui" color="ink2">
        {t('common.loading')}
      </Text>
    );
  }

  if (paidAccess.status === 'signed-out') {
    return (
      <View style={[choiceStyles.column, isDesktop && choiceStyles.columnDesktop]}>
        <Text role="ui" color="ink2">
          {t('voice.signInToContinue')}
        </Text>
        <Button title={t('account.signIn')} onPress={() => openPaidClient(paidAccountUrl)} />
        <Button title={t('voice.readAlone')} variant="secondary" onPress={onReadAlone} />
      </View>
    );
  }

  if (paidAccess.status === 'unreachable') {
    return (
      <View style={[choiceStyles.column, isDesktop && choiceStyles.columnDesktop]}>
        <Text role="ui" color="ink2">
          {t('account.error.offline')}
        </Text>
        <Button title={t('packs.status.retry')} onPress={paidAccess.refresh} />
        <Button
          title={t('voice.trial.haveIt')}
          variant="secondary"
          onPress={() => openPaidClient(paidAccountUrl)}
        />
        <Button title={t('voice.readAlone')} variant="secondary" onPress={onReadAlone} />
      </View>
    );
  }

  return (
    <View style={[choiceStyles.column, isDesktop && choiceStyles.columnDesktop]}>
      <View style={choiceStyles.choice}>
        <Button
          title={t('voice.trial.cta', { days: trial.days })}
          onPress={() => openPaidClient(trialUrl)}
        />
        <Text role="caption" color="ink2">
          {t('voice.trial.note', { monthly: trial.monthly, yearly: trial.yearly })}
        </Text>
      </View>

      <Button
        title={t('voice.trial.haveIt')}
        variant="secondary"
        onPress={() => openPaidClient(paidAccountUrl)}
      />

      {panelState.kind === 'unsupported' ? (
        <Text role="caption" color="ink2">
          {t('voice.browser.noWebgpu')}
        </Text>
      ) : (
        <View style={choiceStyles.choice}>
          <Button
            title={t('voice.browser.choice')}
            variant="secondary"
            onPress={() => setShowBrowser(true)}
          />
          <Text role="caption" color="ink2">
            {t('voice.browser.choiceNote', { size: browserSizeMb })}
          </Text>
        </View>
      )}

      <Button title={t('byok.row')} variant="secondary" onPress={onOwnKey} />

      <Pressable
        {...webPressFeedback}
        onPress={onReadAlone}
        accessibilityRole="button"
        style={({ pressed }) => [choiceStyles.readAlone, webCursor, pressed && { opacity: 0.72 }]}
      >
        <Text role="ui" size={15} color="ink2" style={choiceStyles.readAloneLabel}>
          {t('voice.readAlone')}
        </Text>
      </Pressable>

      {showBrowser ? (
        <TutorModelsPanel state={panelState} onChanged={onChanged} showRemove={false} />
      ) : null}
    </View>
  );
}

const choiceStyles = StyleSheet.create({
  column: {
    gap: space.md,
  },
  columnDesktop: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  choice: {
    gap: space.xs,
  },
  readAlone: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readAloneLabel: {
    textDecorationLine: 'underline',
  },
});

export default function VoiceScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  // Read here as well as in useVoiceSession: the gate only needs "is the
  // cloud path usable", this screen needs to tell "no plan" apart from "no
  // answer" so it can stop selling a subscription to a subscriber.
  const me = useMe();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    bookId,
    mode: modeParam,
    review,
    provider: providerParam,
  } = useLocalSearchParams<{ bookId: string; mode?: string; review?: string; provider?: string }>();
  const preferences = useSottoStore((s) => s.preferences);
  const savedWords = useSottoStore((s) => s.savedWords);
  const [selectedWord, setSelectedWord] = useState<TranscriptWordSegment | null>(null);
  const progress = useSottoStore((s) => s.progress);
  const bookLocale = useSottoStore((s) => s.bookLocale);
  const setPreferences = useSottoStore((s) => s.setPreferences);
  // R-adversarial finding 8: this screen never read `ownProviderStatus` —
  // Settings ↔ Tutor models agreed with each other, but the tutor screen
  // itself could still show a byok chip with no hint that the setting
  // behind it is disconnected/rejected. Same source Settings reads
  // (src/voice/ownProviderStatus.ts) so the mode row's byok chip and the
  // hub row always describe the same state.
  const ownProviderStatus = useOwnProviderStatus();

  const session = useVoiceSession({
    bookId: bookId ?? '',
    mode: (modeParam as TutorMode | undefined) ?? undefined,
    reviewOnly: review === '1',
    requestedPath:
      providerParam === 'byok' || providerParam === 'cloud' || providerParam === 'browser'
        ? providerParam
        : undefined,
  });

  const [pttHeld, setPttHeld] = useState(false);
  // Run 9 lane D directive 2: a "Not what you said? Type it" tap pushes the
  // misheard transcript into the text fallback. The nonce is what makes a
  // second tap on the same caption re-prefill a field the learner has since
  // edited or cleared.
  const [correctionPrefill, setCorrectionPrefill] = useState<{ text: string; nonce: number }>({
    text: '',
    nonce: 0,
  });
  // run7/G directive 1(a): screen-local — the toggle only needs to persist
  // for this mounted session, same lifetime as `pttHeld`; the provider
  // itself is the source of truth for whether playback is actually muted.
  const [outputMuted, setOutputMuted] = useState(false);

  const locale = bookId
    ? (bookLocale(bookId) ?? preferences.learningLocale)
    : preferences.learningLocale;
  const cjk = locale ? getLanguage(locale).typography === 'cjk' : false;
  const savedTranscriptWords = useMemo(
    () =>
      new Set(
        savedWords
          .filter((word) => word.bookId === bookId)
          .map((word) => normalizeTranscriptWord(word.sourceWord)),
      ),
    [savedWords, bookId],
  );

  useEffect(() => setSelectedWord(null), [bookId, session.chapter?.id]);

  const passage = useMemo(() => {
    if (!session.chapter) return null;
    return buildPassageWindow(session.chapter, progress[bookId ?? '']?.tokenId);
  }, [session.chapter, progress, bookId]);

  const flatTokens = useMemo(() => {
    if (!session.chapter) return [];
    return session.chapter.blocks.flatMap((b) => b.sentences.flatMap((s) => s.tokens));
  }, [session.chapter]);

  const currentIndex = useMemo(() => {
    if (session.readingTokenIds.length === 0) return -1;
    const readingSet = new Set(session.readingTokenIds);
    let idx = -1;
    flatTokens.forEach((tk, i) => {
      if (readingSet.has(tk.id)) idx = i;
    });
    return idx;
  }, [flatTokens, session.readingTokenIds]);

  // A `reading` event marks the start of an active read; it never clears on
  // its own (readingTokenIds only resets when the session ends), so track
  // activity with a timer instead of trusting "non-empty" forever.
  const [readingActive, setReadingActive] = useState(false);
  const lastVoiceStateRef = useRef(session.voiceState);

  useEffect(() => {
    if (session.readingTokenIds.length === 0) return;
    setReadingActive(true);
    const timer = setTimeout(() => setReadingActive(false), READING_ACTIVE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [session.readingTokenIds]);

  useEffect(() => {
    if (lastVoiceStateRef.current !== session.voiceState) {
      lastVoiceStateRef.current = session.voiceState;
      setReadingActive(false);
    }
  }, [session.voiceState]);

  // Grouped by sentence (not a single flattened token array) so
  // SpeechFillText — the same flowing-paragraph renderer the reader uses —
  // can join sentences inline with its own single inter-sentence space,
  // rather than this screen faking one via a forced spaceBefore.
  const passageSentences: SpeechSentence[] = passage
    ? passage.sentences.map((s) => ({
        id: s.id,
        tokens: s.tokenIds
          .map((id) => flatTokens.find((tk) => tk.id === id))
          .filter((tk): tk is NonNullable<typeof tk> => !!tk)
          .map((tk) => ({
            id: tk.id,
            text: tk.text,
            spaceBefore: tk.spaceBefore,
            isWord: tk.isWord,
            spoken: !readingActive || (currentIndex >= 0 && flatTokens.indexOf(tk) <= currentIndex),
          })),
      }))
    : [];
  const hasPassage = passageSentences.some((s) => s.tokens.length > 0);

  const readSeulPath = `/reader/${bookId}` as const;
  const currentProgress = progress[bookId ?? ''];
  const paidHandoff = useMemo<PaidReaderHandoff>(
    () => ({
      bookId: bookId ?? '',
      learningLocale: locale,
      interfaceLocale: preferences.interfaceLocale,
      explanationLocale: preferences.explanationLocale,
      level: preferences.level,
      chapterId: currentProgress?.chapterId ?? session.chapter?.id,
      // Reader scroll progress does not always carry a token id. In that
      // case, the first token in the passage card is the precise visible
      // place to hand to the other origin.
      tokenId: currentProgress?.tokenId ?? passage?.sentences[0]?.tokenIds[0],
      openTutor: true,
    }),
    [
      bookId,
      locale,
      preferences.interfaceLocale,
      preferences.explanationLocale,
      preferences.level,
      currentProgress?.chapterId,
      currentProgress?.tokenId,
      passage?.sentences,
      session.chapter?.id,
    ],
  );
  const paywallPath = `/paywall?returnTo=${encodeURIComponent(
    `/voice/${bookId ?? ''}?mode=${session.mode}`,
  )}` as const;
  const isBroken = needsRecovery({
    voiceState: session.voiceState,
    limitReason: session.limitReason,
    code: session.error?.code,
  });
  const availability = session.availability;
  const isChecking = availability.status === 'checking';
  // O2-B: the old two-state gate (checking / unavailable) is now three-state.
  // `needs-download` and `no-webgpu` are the in-browser tutor's own states
  // (planning/BROWSER-TUTOR.md) and get the download panel instead of the
  // server message; a real server problem keeps the message it always had.
  const panelState: TutorModelsPanelState | null =
    availability.status === 'needs-download'
      ? { kind: 'needs-download', models: availability.models }
      : availability.status === 'unavailable' && availability.reason === 'no-webgpu'
        ? { kind: 'unsupported' }
        : null;
  const isServerUnavailable =
    availability.status === 'unavailable' && availability.reason !== 'no-webgpu';
  // Everything that used to be hidden behind "unavailable" stays hidden for
  // both flavours: no mode chips, transcript or controls until a tutor can run.
  const isUnavailable = isServerUnavailable || panelState !== null;
  // `/me` failed for something other than a 401 (src/cloud/useMe.ts), so the
  // cloud path was ruled out by a connection problem rather than by a real
  // answer about this reader's plan. Only replaces the panels below — a
  // tutor that can run (local server, downloaded browser models) still runs.
  const cloudUnreachable =
    cloud.enabled && isUnavailable && me.status === 'signed-out' && me.reason === 'unreachable';
  const hostedAccess = paidJourneyState(
    me.status,
    me.status === 'signed-in' ? me.me.entitlement.plan : undefined,
    me.status === 'signed-out' ? me.reason : undefined,
  );
  const unavailableMessage =
    availability.status === 'unavailable' && availability.reason === 'server'
      ? t('voice.unavailableServer')
      : availability.status === 'unavailable' && availability.reason === 'services'
        ? t('voice.unavailableServices', {
            services: availability.missing.map((s) => t(`voice.service.${s}`)).join(', '),
          })
        : '';

  const recoverySpec = isBroken
    ? recoveryPanelFor({
        code: session.error?.code,
        limitReason: session.limitReason,
        voiceState: session.voiceState,
        cloudEnabled: cloud.enabled,
      })
    : null;
  const recoveryMessage = recoveryMessageFor({
    code: session.error?.code,
    message: session.error?.message,
    limitReason: session.limitReason,
    hosted: session.activePath === 'cloud',
  });

  return (
    <View
      style={[
        styles.root,
        !isDesktop && styles.rootCompact,
        { paddingBottom: (isDesktop ? space.xl : space.sm) + insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => exitTutor(session.end, router, bookId)}
        />
        <IconButton
          icon={<SettingsGlyph size={20} />}
          accessibilityLabel={t('home.settings')}
          onPress={() => router.push('/settings')}
        />
      </View>

      <PassageCard
        title={session.chapterTitle ?? t('voice.loading')}
        sentences={passageSentences}
        hasPassage={hasPassage}
        isLoading={isChecking}
        selectedId={session.explanation?.tokenId}
        cjk={cjk}
        onChangePassage={() => router.replace(readSeulPath)}
      />

      {!isChecking && !isUnavailable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.modeScroll}
          contentContainerStyle={styles.modeRow}
        >
          {MODES.map((m) => (
            <Pressable
              {...webPressFeedback}
              accessibilityRole="radio"
              aria-checked={session.mode === m}
              accessibilityState={{ checked: session.mode === m }}
              key={m}
              onPress={() => session.setMode(m)}
              accessibilityLabel={t(`voice.mode.${m}` as const)}
              style={({ pressed }) => [
                isDesktop ? styles.modeChip : styles.modeTargetCompact,
                isDesktop && session.mode === m && styles.modeChipActive,
                webCursor,
                pressed && { opacity: 0.72 },
              ]}
            >
              <View
                style={
                  isDesktop
                    ? undefined
                    : [styles.modeFaceCompact, session.mode === m && styles.modeChipActive]
                }
              >
                <Text
                  role="caption"
                  size={isDesktop ? undefined : 12}
                  color={session.mode === m ? 'surface' : 'ink'}
                  style={styles.modeLabel}
                  numberOfLines={1}
                >
                  {t(`voice.mode.${m}` as const)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* R3-S: desktop-only chip row offering a choice between the local/
          browser tutor and the hosted cloud one, when both are usable. */}
      {!isChecking &&
      availability.status === 'ready' &&
      (availability.alternatives?.length ?? 0) > 1 ? (
        <View style={styles.modeRow}>
          {availability.alternatives!.map((p) => (
            <Pressable
              {...webPressFeedback}
              accessibilityRole="radio"
              aria-checked={session.activePath === p}
              accessibilityState={{ checked: session.activePath === p }}
              key={p}
              onPress={() => session.switchPath(p)}
              style={({ pressed }) => [
                styles.modeChip,
                session.activePath === p && styles.modeChipActive,
                webCursor,
                pressed && { opacity: 0.72 },
              ]}
            >
              <Text role="caption" color={session.activePath === p ? 'surface' : 'ink'}>
                {p === 'byok'
                  ? // Same `byok.status.*` keys the Settings hub row reads
                    // (app/settings/index.tsx) — one status, everywhere.
                    `${t('byok.pathLabel')} — ${t(`byok.status.${ownProviderStatus}` as const)}`
                  : t(`voice.path.${p}` as const)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {session.activePath ? (
        <Text role="caption" color="ink2" accessibilityLiveRegion="polite">
          {session.activePath === 'byok'
            ? 'Your OpenAI key · billed directly by OpenAI. A saved key is not proof that tutoring works.'
            : session.activePath === 'cloud'
              ? 'Cloud · uses your included Sotto tutor minutes.'
              : session.activePath === 'browser'
                ? 'Browser · free local processing. Spoken replies are English-only; other languages use text. Saving words by voice is unfinished. Language instructions may not always be followed.'
                : 'Your server · uses your server configuration.'}
        </Text>
      ) : !isChecking && providerParam ? (
        <Text role="caption" color="warn">
          The requested provider is unavailable. Reconnect it in Settings or explicitly choose
          another provider.
        </Text>
      ) : null}
      {providerParam === 'byok' && ownProviderStatus === 'active' ? (
        <Text accessibilityLiveRegion="polite" role="caption">
          Key tutor test succeeded in this session.
        </Text>
      ) : null}
      {!isUnavailable ? (
        <Transcript
          captions={session.captions}
          sourceLocale={locale}
          onWordPress={session.chapter ? setSelectedWord : undefined}
          isWordSaved={(word) => savedTranscriptWords.has(word.normalized)}
          onReplaySentence={session.replaySentence}
          correctableId={correctableCaptionId(session.captions, session.activePath)}
          onCorrectCaption={(text) =>
            setCorrectionPrefill((prev) => ({ text, nonce: prev.nonce + 1 }))
          }
        />
      ) : panelState && !cloud.enabled ? null : (
        // The free app's decision list (below) sits directly under the
        // passage; the spacer would push it to the bottom of the screen and
        // leave a blank band where a stranger expects the next step.
        <View style={styles.spacer} />
      )}

      {session.explanation ? (
        <View style={styles.explanationCard}>
          <Text role="heading" size={16}>
            {session.explanation.title}
          </Text>
          <Text role="ui" size={14} color="ink2">
            {session.explanation.body}
          </Text>
        </View>
      ) : null}

      {panelState && !cloud.enabled ? (
        <FreeTutorChoices
          handoff={paidHandoff}
          panelState={panelState}
          onChanged={session.recheckAvailability}
          onOwnKey={() => router.push('/settings/openai-key')}
          onReadAlone={() => router.replace(readSeulPath)}
        />
      ) : cloud.enabled && isUnavailable && hostedAccess === 'pending' ? (
        <Text role="ui" color="ink2">
          {t('common.loading')}
        </Text>
      ) : cloud.enabled && isUnavailable && hostedAccess === 'sign-in' ? (
        <View style={styles.recovery}>
          <Text role="ui" color="ink2">
            {t('voice.signInToContinue')}
          </Text>
          <Button
            title={t('account.signIn')}
            onPress={() =>
              router.push(
                `/account?returnTo=${encodeURIComponent(`/voice/${bookId ?? ''}?mode=${session.mode}`)}`,
              )
            }
          />
          <Button
            title={t('voice.readAlone')}
            variant="secondary"
            onPress={() => router.replace(readSeulPath)}
          />
        </View>
      ) : cloud.enabled && isUnavailable && hostedAccess === 'subscribed' ? (
        <View style={styles.recovery}>
          <Button
            title={t('packs.status.retry')}
            onPress={() => {
              me.refresh();
              session.recheckAvailability();
            }}
          />
          <Button
            title={t('account.usageRow')}
            variant="secondary"
            onPress={() => router.push('/usage')}
          />
          <Button
            title={t('voice.readAlone')}
            variant="secondary"
            onPress={() => router.replace(readSeulPath)}
          />
        </View>
      ) : cloudUnreachable ? (
        // The paid origin, with no answer from /me. Until that request
        // succeeds we do not know whether this reader has a plan, so
        // neither "Subscribe" nor a personal key is the honest next step:
        // say what actually went wrong and leave the book readable.
        <View style={styles.recovery}>
          <Text role="caption" color="warn" style={styles.recoveryText}>
            Could not reach Sotto&apos;s server. Check your connection and try again.
          </Text>
          <View style={styles.recoveryButtons}>
            <Button
              title={t('voice.readAlone')}
              variant="secondary"
              onPress={() => router.replace(readSeulPath)}
              style={styles.recoveryButton}
            />
          </View>
        </View>
      ) : panelState ? (
        <View style={styles.recovery}>
          <TutorModelsPanel
            state={panelState}
            onChanged={session.recheckAvailability}
            showRemove={false}
          />
          {/* No byok button here: this branch only runs when `cloud.enabled`
              (the free build took the FreeTutorChoices branch above), and on
              the paid origin the answer to "no entitlement detected" is
              Subscribe or read alone, never a personal OpenAI key. */}
          <View style={styles.recoveryButtons}>
            <Button
              title={t('voice.subscribe')}
              onPress={() => router.push(paywallPath)}
              style={styles.recoveryButton}
            />
            <Button
              title={t('voice.readAlone')}
              variant="secondary"
              onPress={() => router.replace(readSeulPath)}
              style={styles.recoveryButton}
            />
          </View>
        </View>
      ) : isServerUnavailable ? (
        <View style={styles.recovery}>
          <Text role="caption" color="warn" style={styles.recoveryText}>
            {unavailableMessage}
          </Text>
          <Text role="caption" color="ink3" style={styles.recoveryText}>
            {t('voice.unavailableHint')}
          </Text>
          <View style={styles.recoveryButtons}>
            {cloud.enabled ? (
              <Button
                title={t('voice.subscribe')}
                onPress={() => router.push(paywallPath)}
                style={styles.recoveryButton}
              />
            ) : (
              // Free build only, same rule as the panel above: a personal
              // key is an answer for someone with no plan to fall back on,
              // not for a subscriber the paid origin failed to recognise.
              <Button
                title={t('byok.row')}
                variant="secondary"
                onPress={() => router.push('/settings/openai-key')}
                style={styles.recoveryButton}
              />
            )}
            <Button
              title={t('voice.readAlone')}
              variant="secondary"
              onPress={() => router.replace(readSeulPath)}
              style={styles.recoveryButton}
            />
          </View>
        </View>
      ) : isBroken && recoverySpec ? (
        <>
          <RecoveryView
            spec={recoverySpec}
            message={recoveryMessage}
            onTryAgain={session.retry}
            onNewSession={session.start}
            onResumePlayback={session.resumePlayback}
            onReadAlone={() => router.replace(readSeulPath)}
            onSeePlans={() => router.push(paywallPath)}
          />
          {session.error?.code === 'playback_blocked' ? (
            <TextFallback onSend={session.sendText} prefill={correctionPrefill} />
          ) : null}
        </>
      ) : session.startControl === 'start' ? (
        // R6-B3: the tutor starts from a tap, not on mount — the
        // availability probe may already have resolved (this button only
        // renders once it has), but `startSession` is only ever invoked
        // from this press handler, synchronously, so the tap's user
        // activation survives into the capture call.
        <View style={styles.startRow}>
          <Button
            disabled={!session.activePath}
            title={t('voice.start')}
            onPress={session.start}
            style={styles.recoveryButton}
          />
        </View>
      ) : session.startControl === 'active' ? (
        <>
          <ControlCluster
            compact={!isDesktop}
            voiceState={session.voiceState}
            inputMuted={session.inputMuted}
            turnDetection={preferences.turnDetection}
            onSetTurnDetection={(next: TurnDetection) => {
              setPttHeld(false);
              session.setTurnDetection(next);
              setPreferences({ turnDetection: next });
            }}
            pttHeld={pttHeld}
            onPushToTalk={(active) => {
              // Run 9 lane D directive 1: pressing the mic while the tutor
              // holds the audio floor is a barge-in first — otherwise the
              // tutor keeps playing over the learner and the cascade hears
              // its own output back through the speakers.
              const action = micPressAction(session.voiceState, active);
              if (!action.capture) return;
              if (active && action.interruptFirst) session.interrupt();
              setPttHeld(active);
              session.pushToTalk(active);
            }}
            onToggleMute={() => session.setMuted(!session.inputMuted)}
            onReplay={session.replayLast}
            onInterrupt={session.interrupt}
            outputMuted={outputMuted}
            onToggleOutputMuted={() => {
              const next = !outputMuted;
              setOutputMuted(next);
              session.setOutputMuted(next);
            }}
            onEnd={() => exitTutor(session.end, router, bookId)}
          />
          <View style={styles.textFallback}>
            <TextFallback onSend={session.sendText} prefill={correctionPrefill} />
          </View>
        </>
      ) : null}
      {selectedWord && session.chapter && bookId ? (
        <TutorWordSheet
          key={`${selectedWord.contextSentence}:${selectedWord.start}`}
          selection={selectedWord}
          chapter={session.chapter}
          bookId={bookId}
          sourceLocale={locale}
          explanationLocale={preferences.explanationLocale}
          onClose={() => setSelectedWord(null)}
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: space.gutter.phone,
      paddingTop: space.lg,
      paddingBottom: space.xl,
      gap: space.md,
    },
    rootCompact: {
      paddingTop: space.sm,
      gap: space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modeScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    modeRow: {
      flexGrow: 1,
      flexDirection: 'row',
      gap: space.sm,
    },
    modeChip: {
      flex: 1,
      minHeight: space.tapTarget,
      justifyContent: 'center',
      backgroundColor: colors.surface2,
      borderRadius: 10,
      paddingVertical: space.sm,
      alignItems: 'center',
    },
    modeChipActive: {
      backgroundColor: colors.ink,
    },
    modeTargetCompact: {
      flexGrow: 1,
      flexShrink: 0,
      minWidth: space.tapTarget,
      minHeight: space.tapTarget,
      justifyContent: 'center',
    },
    modeFaceCompact: {
      backgroundColor: colors.surface2,
      borderRadius: 8,
      paddingHorizontal: space.xs,
      paddingVertical: space.xs,
      alignItems: 'center',
    },
    modeLabel: {
      maxWidth: '100%',
      textAlign: 'center',
      userSelect: 'none',
    },
    spacer: {
      flex: 1,
      minHeight: 0,
    },
    explanationCard: {
      gap: space.xs,
    },
    recovery: {
      alignItems: 'center',
      gap: space.md,
    },
    recoveryText: {
      textAlign: 'center',
    },
    recoveryButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: space.sm,
    },
    recoveryButton: {
      minWidth: 140,
    },
    startRow: {
      alignItems: 'center',
    },
    textFallback: {
      marginTop: space.xs,
    },
  });
}
