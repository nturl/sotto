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
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLanguage, type TutorMode } from '@sotto/core';
import { space } from '@sotto/core/theme';
import { useCloud } from '../../src/cloud/provider';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { CloseGlyph, SettingsGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import type { SpeechSentence } from '../../src/ui/SpeechFillText';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { useSottoStore } from '../../src/state/store';
import { buildPassageWindow } from '../../src/voice/passage';
import { TutorModelsPanel, type TutorModelsPanelState } from '../../src/voice/TutorModelsPanel';
import { useOwnProviderStatus } from '../../src/voice/ownProviderStatus';
import { useVoiceSession } from '../../src/voice/useVoiceSession';
import { ControlCluster, type TurnDetection } from '../../src/voice/ui/ControlCluster';
import { PassageCard } from '../../src/voice/ui/PassageCard';
import { RecoveryView } from '../../src/voice/ui/RecoveryView';
import { recoveryPanelFor } from '../../src/voice/ui/recoveryPanel';
import { TextFallback } from '../../src/voice/ui/TextFallback';
import { Transcript } from '../../src/voice/ui/Transcript';

const MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

// ADVERSARIAL-REVIEW.md §1.9 / §3 row 28: SpeechFillText painted the whole
// passage `quiet` whenever no `reading` event had ever arrived — the
// permanent state in discuss/pronunciation and while just listening, since
// nothing is ever "read" there. Now the passage defaults to ink and only
// dims-then-fills while a reading event is actively in flight (for this
// window after the last one, or until the voice state changes).
const READING_ACTIVE_WINDOW_MS = 6000;

export default function VoiceScreen() {
  const t = useT();
  const router = useRouter();
  const cloud = useCloud();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    bookId,
    mode: modeParam,
    review,
  } = useLocalSearchParams<{ bookId: string; mode?: string; review?: string }>();
  const preferences = useSottoStore((s) => s.preferences);
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
  });

  const [pttHeld, setPttHeld] = useState(false);
  // run7/G directive 1(a): screen-local — the toggle only needs to persist
  // for this mounted session, same lifetime as `pttHeld`; the provider
  // itself is the source of truth for whether playback is actually muted.
  const [outputMuted, setOutputMuted] = useState(false);

  const locale = bookId
    ? (bookLocale(bookId) ?? preferences.learningLocale)
    : preferences.learningLocale;
  const cjk = locale ? getLanguage(locale).typography === 'cjk' : false;

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
  const isBroken =
    session.voiceState === 'error' ||
    session.voiceState === 'reconnecting' ||
    !!session.limitReason;
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
  const recoveryMessage =
    session.limitReason === 'cap'
      ? (session.error?.message ?? undefined)
      : session.error?.code === 'cap_exhausted' || session.error?.code === 'plan_required'
        ? session.error.message
        : undefined;

  return (
    <View style={[styles.root, { paddingBottom: space.xl + insets.bottom }]}>
      <View style={styles.header}>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
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
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => session.setMode(m)}
              style={[styles.modeChip, session.mode === m && styles.modeChipActive, webCursor]}
            >
              <Text role="caption" color={session.mode === m ? 'surface' : 'ink'}>
                {t(`voice.mode.${m}` as const)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* R3-S: desktop-only chip row offering a choice between the local/
          browser tutor and the hosted cloud one, when both are usable. */}
      {!isChecking &&
      availability.status === 'ready' &&
      (availability.alternatives?.length ?? 0) > 1 ? (
        <View style={styles.modeRow}>
          {availability.alternatives!.map((p) => (
            <Pressable
              key={p}
              onPress={() => session.switchPath(p)}
              style={[
                styles.modeChip,
                session.activePath === p && styles.modeChipActive,
                webCursor,
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

      {!isUnavailable ? (
        <Transcript captions={session.captions} onReplaySentence={session.replaySentence} />
      ) : (
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

      {panelState ? (
        <View style={styles.recovery}>
          <TutorModelsPanel
            state={panelState}
            onChanged={session.recheckAvailability}
            showRemove={false}
          />
          <View style={styles.recoveryButtons}>
            {cloud.enabled ? (
              <Button
                title={t('voice.subscribe')}
                onPress={() => router.push('/paywall')}
                style={styles.recoveryButton}
              />
            ) : null}
            <Button
              title={t('byok.row')}
              variant="secondary"
              onPress={() => router.push('/settings/openai-key')}
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
                onPress={() => router.push('/paywall')}
                style={styles.recoveryButton}
              />
            ) : null}
            <Button
              title={t('byok.row')}
              variant="secondary"
              onPress={() => router.push('/settings/openai-key')}
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
      ) : isBroken && recoverySpec ? (
        <RecoveryView
          spec={recoverySpec}
          message={recoveryMessage}
          onTryAgain={session.retry}
          onNewSession={session.start}
          onResumePlayback={session.resumePlayback}
          onReadAlone={() => router.replace(readSeulPath)}
        />
      ) : session.startControl === 'start' ? (
        // R6-B3: the tutor starts from a tap, not on mount — the
        // availability probe may already have resolved (this button only
        // renders once it has), but `startSession` is only ever invoked
        // from this press handler, synchronously, so the tap's user
        // activation survives into the capture call.
        <View style={styles.startRow}>
          <Button title={t('voice.start')} onPress={session.start} style={styles.recoveryButton} />
        </View>
      ) : session.startControl === 'active' ? (
        <>
          <ControlCluster
            voiceState={session.voiceState}
            turnDetection={preferences.turnDetection}
            onSetTurnDetection={(next: TurnDetection) => setPreferences({ turnDetection: next })}
            pttHeld={pttHeld}
            onPushToTalk={(active) => {
              setPttHeld(active);
              session.pushToTalk(active);
            }}
            onToggleMute={() => session.setMuted(session.voiceState !== 'muted')}
            onReplay={session.replayLast}
            onInterrupt={session.interrupt}
            outputMuted={outputMuted}
            onToggleOutputMuted={() => {
              const next = !outputMuted;
              setOutputMuted(next);
              session.setOutputMuted(next);
            }}
            onEnd={() => {
              session.end();
              router.back();
            }}
          />
          <View style={styles.textFallback}>
            <TextFallback onSend={session.sendText} />
          </View>
        </>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modeRow: {
      flexDirection: 'row',
      gap: space.sm,
    },
    modeChip: {
      flex: 1,
      backgroundColor: colors.surface2,
      borderRadius: 10,
      paddingVertical: space.sm,
      alignItems: 'center',
    },
    modeChipActive: {
      backgroundColor: colors.ink,
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
