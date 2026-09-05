/**
 * Voice screen — DESIGN.md "Voice screen". CONTRACTS §6 route: /voice/[bookId].
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLanguage, type TutorMode } from '@sotto/core';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { CloseGlyph, MicGlyph, MuteGlyph, ReplayGlyph, StopGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { SpeechFillText, type SpeechSentence } from '../../src/ui/SpeechFillText';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';
import { webCursor } from '../../src/ui/tokens';
import { useSottoStore } from '../../src/state/store';
import { buildPassageWindow } from '../../src/voice/passage';
import { TutorModelsPanel, type TutorModelsPanelState } from '../../src/voice/TutorModelsPanel';
import { useVoiceSession } from '../../src/voice/useVoiceSession';

const MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

// ADVERSARIAL-REVIEW.md §1.9 / §3 row 28: SpeechFillText painted the whole
// passage `quiet` whenever no `reading` event had ever arrived — the
// permanent state in discuss/pronunciation and while just listening, since
// nothing is ever "read" there. Now the passage defaults to ink and only
// dims-then-fills while a reading event is actively in flight (for this
// window after the last one, or until the voice state changes).
const READING_ACTIVE_WINDOW_MS = 6000;

function stateColor(state: string, colors: ReturnType<typeof useTheme>['colors']): string {
  if (state === 'listening') return colors.accent;
  if (state === 'speaking' || state === 'thinking') return colors.ink;
  return colors.ink3;
}

export default function VoiceScreen() {
  const t = useT();
  const router = useRouter();
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

  const session = useVoiceSession({
    bookId: bookId ?? '',
    mode: (modeParam as TutorMode | undefined) ?? undefined,
    reviewOnly: review === '1',
  });

  const [muted, setMutedState] = useState(false);
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [pttHeld, setPttHeld] = useState(false);

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
  // both flavours: no mode chips, captions or PTT ring until a tutor can run.
  const isUnavailable = isServerUnavailable || panelState !== null;
  const unavailableMessage =
    availability.status === 'unavailable' && availability.reason === 'server'
      ? t('voice.unavailableServer')
      : availability.status === 'unavailable' && availability.reason === 'services'
        ? t('voice.unavailableServices', {
            services: availability.missing.map((s) => t(`voice.service.${s}`)).join(', '),
          })
        : '';

  const recentCaptions = session.captions.slice(-6);

  return (
    <View style={[styles.root, { paddingBottom: space.xl + insets.bottom }]}>
      <View style={styles.header}>
        <View style={styles.stateRow}>
          <View style={[styles.dot, { backgroundColor: stateColor(session.voiceState, colors) }]} />
          <Text role="mono" color="ink2">
            {t(`voice.state.${session.voiceState}` as const)}
          </Text>
          {/* R3-S: cloud-path minutes-remaining ticker, from {t:'usage'}
              messages — absent (null) on every other path. */}
          {session.remainingSeconds != null ? (
            <Text role="mono" color="ink3">
              {t('voice.remainingMinutes', {
                minutes: Math.max(0, Math.round(session.remainingSeconds / 60)),
              })}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>

      <ScrollView style={styles.passageScroll} contentContainerStyle={styles.passage}>
        {!isChecking && hasPassage ? (
          <SpeechFillText
            sentences={passageSentences}
            selectedId={session.explanation?.tokenId}
            cjk={cjk}
          />
        ) : (
          <Text role="caption" color="ink3">
            {t('voice.loading')}
          </Text>
        )}
      </ScrollView>

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
          browser tutor and the hosted cloud one, when both are usable
          (availability.ts's resolveAvailability only fills `alternatives`
          past one entry on desktop). Phones never see this — cloud wins
          outright there when usable. */}
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
                {t(`voice.path.${p}` as const)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!isUnavailable ? (
        <>
          <Pressable onPress={() => setCaptionsOpen((v) => !v)} style={webCursor}>
            <Text role="caption" color="ink2" style={styles.captionsToggle}>
              {t('voice.captionsToggle')}
            </Text>
          </Pressable>
          {captionsOpen ? (
            <View style={styles.captionsStrip}>
              {recentCaptions.map((c) => (
                <Text
                  key={c.id}
                  role="caption"
                  color={c.speaker === 'tutor' ? 'ink' : 'ink2'}
                  style={styles.captionLine}
                >
                  {c.speaker === 'tutor' ? t('voice.tutorLabel') : t('voice.learnerLabel')}:{' '}
                  {c.text}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {panelState ? (
        <View style={styles.recovery}>
          <TutorModelsPanel
            state={panelState}
            onChanged={session.recheckAvailability}
            showRemove={false}
          />
          <Button
            title={t('voice.readAlone')}
            variant="secondary"
            onPress={() => router.replace(readSeulPath)}
          />
        </View>
      ) : isServerUnavailable ? (
        <View style={styles.recovery}>
          <Text role="caption" color="warn" style={styles.recoveryText}>
            {unavailableMessage}
          </Text>
          <Text role="caption" color="ink3" style={styles.recoveryText}>
            {t('voice.unavailableHint')}
          </Text>
          <Button
            title={t('voice.readAlone')}
            variant="secondary"
            onPress={() => router.replace(readSeulPath)}
          />
        </View>
      ) : isBroken ? (
        // R3-S: cap_exhausted/plan_required (a CloudError surfaced through
        // the provider's 'error' event, or `{t:'limit', reason:'cap'}` mid-
        // session) show the server's own message plus a "See plans" button
        // next to "Read alone" — every other broken state keeps its plain
        // generic message and single button.
        <View style={styles.recovery}>
          <Text role="caption" color="warn" style={styles.recoveryText}>
            {session.limitReason === 'cap'
              ? (session.error?.message ?? t('voice.limitReached'))
              : session.limitReason
                ? t('voice.limitReached')
                : session.error?.code === 'cap_exhausted' || session.error?.code === 'plan_required'
                  ? session.error.message
                  : session.error?.code === 'mic_unavailable'
                    ? t('voice.micUnavailable')
                    : t('voice.connectionIssue')}
          </Text>
          <View style={styles.recoveryButtons}>
            {session.limitReason === 'cap' ||
            session.error?.code === 'cap_exhausted' ||
            session.error?.code === 'plan_required' ? (
              <Button
                title={t('voice.seePlans')}
                onPress={() => router.push('/paywall')}
                style={styles.recoveryButton}
              />
            ) : null}
            <Button
              title={t('voice.readAlone')}
              variant="secondary"
              onPress={() => router.replace(readSeulPath)}
              style={styles.recoveryButton}
            />
          </View>
        </View>
      ) : (
        <View style={styles.controls}>
          <IconButton
            icon={<MuteGlyph size={20} />}
            accessibilityLabel={t('voice.mute')}
            onPress={() => {
              const next = !muted;
              setMutedState(next);
              session.setMuted(next);
            }}
          />
          <IconButton
            icon={<ReplayGlyph size={20} />}
            accessibilityLabel={t('voice.replay')}
            onPress={session.replayLast}
          />
          <IconButton
            icon={<StopGlyph size={20} />}
            accessibilityLabel={t('voice.interrupt')}
            onPress={session.interrupt}
          />
          <IconButton
            icon={<CloseGlyph size={20} />}
            accessibilityLabel={t('voice.end')}
            onPress={() => {
              session.end();
              router.back();
            }}
          />
        </View>
      )}

      {!isChecking && !isUnavailable ? (
        <View style={styles.pttWrap}>
          {preferences.turnDetection === 'push' ? (
            <Pressable
              onPressIn={() => {
                setPttHeld(true);
                session.pushToTalk(true);
              }}
              onPressOut={() => {
                setPttHeld(false);
                session.pushToTalk(false);
              }}
              style={[styles.pttRing, pttHeld && styles.pttRingActive, webCursor]}
            >
              <MicGlyph size={26} color={pttHeld ? colors.surface : colors.accent} />
            </Pressable>
          ) : (
            <>
              <View style={[styles.pttRing, styles.pttDisabled]}>
                <MicGlyph size={26} color={colors.ink3} />
              </View>
              <Text role="caption" color="ink3" style={styles.pttCaption}>
                {t('voice.pttDisabled')}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.canvas,
      paddingHorizontal: space.gutter.phone,
      paddingTop: space.xl,
      paddingBottom: space.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.xl,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    // ADVERSARIAL-REVIEW.md §1.9/§3 row 28: the passage used to be a plain
    // View with no scroll, so a chapter's-worth of text pushed the mode
    // chips/captions/controls/PTT ring below the viewport with nothing able
    // to reclaim the space — clipping the ring at narrow widths (375/430).
    // `flex: 1` + `minHeight: 0` lets this ScrollView shrink and scroll
    // instead, so everything below it stays pinned and on screen.
    passageScroll: {
      flex: 1,
      minHeight: 0,
    },
    passage: {
      paddingBottom: space.lg,
    },
    explanationCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.lg,
      marginBottom: space.lg,
      gap: space.xs,
    },
    modeRow: {
      flexDirection: 'row',
      gap: space.sm,
      marginBottom: space.md,
    },
    modeChip: {
      flex: 1,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingVertical: space.sm,
      alignItems: 'center',
    },
    modeChipActive: {
      backgroundColor: colors.ink,
    },
    captionsToggle: {
      marginBottom: space.sm,
    },
    captionsStrip: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.xs,
      marginBottom: space.lg,
    },
    captionLine: {
      lineHeight: 18,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: space.xl,
      marginBottom: space.xl,
    },
    recovery: {
      alignItems: 'center',
      gap: space.md,
      marginBottom: space.xl,
    },
    recoveryText: {
      textAlign: 'center',
    },
    recoveryButtons: {
      flexDirection: 'row',
      gap: space.sm,
    },
    recoveryButton: {
      minWidth: 140,
    },
    pttWrap: {
      alignItems: 'center',
      gap: space.sm,
    },
    pttRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pttRingActive: {
      backgroundColor: colors.accent,
    },
    pttDisabled: {
      borderColor: colors.ink3,
      opacity: 0.6,
    },
    pttCaption: {
      textAlign: 'center',
    },
  });
}
