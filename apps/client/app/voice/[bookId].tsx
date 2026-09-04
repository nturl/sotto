/**
 * Voice screen — DESIGN.md "Voice screen". CONTRACTS §6 route: /voice/[bookId].
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getLanguage, type TutorMode } from '@sotto/core';
import { colors, radius, space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { Button } from '../../src/ui/Button';
import { CloseGlyph, MicGlyph, MuteGlyph, ReplayGlyph, StopGlyph } from '../../src/ui/Glyphs';
import { IconButton } from '../../src/ui/IconButton';
import { SpeechFillText } from '../../src/ui/SpeechFillText';
import { Text } from '../../src/ui/Text';
import { webCursor } from '../../src/ui/tokens';
import { useSottoStore } from '../../src/state/store';
import { buildPassageWindow } from '../../src/voice/passage';
import { useVoiceSession } from '../../src/voice/useVoiceSession';

const MODES: TutorMode[] = ['read_to_me', 'read_with_me', 'pronunciation', 'discuss'];

function stateColor(state: string): string {
  if (state === 'listening') return colors.accent;
  if (state === 'speaking' || state === 'thinking') return colors.ink;
  return colors.ink3;
}

export default function VoiceScreen() {
  const t = useT();
  const router = useRouter();
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

  const passageTokens = passage
    ? passage.sentences.flatMap((s) =>
        s.tokenIds
          .map((id) => flatTokens.find((tk) => tk.id === id))
          .filter((tk): tk is NonNullable<typeof tk> => !!tk)
          // Force a space before each sentence's first token — spaceBefore
          // reflects spacing *within* the sentence it was tokenized from,
          // not between two different sentences flattened together here.
          .map((tk, i) => (i === 0 ? { ...tk, spaceBefore: true } : tk)),
      )
    : [];

  const readSeulPath = `/reader/${bookId}` as const;
  const isBroken =
    session.voiceState === 'error' ||
    session.voiceState === 'reconnecting' ||
    !!session.limitReason;

  const recentCaptions = session.captions.slice(-6);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.stateRow}>
          <View style={[styles.dot, { backgroundColor: stateColor(session.voiceState) }]} />
          <Text role="mono" color="ink2">
            {t(`voice.state.${session.voiceState}` as const)}
          </Text>
        </View>
        <IconButton
          icon={<CloseGlyph size={20} />}
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>

      <View style={styles.passage}>
        {passageTokens.length > 0 ? (
          <SpeechFillText
            tokens={passageTokens.map((tk) => ({
              id: tk.id,
              text: tk.text,
              spaceBefore: tk.spaceBefore,
            }))}
            currentIndex={currentIndex}
            selectedId={session.explanation?.tokenId}
            cjk={cjk}
          />
        ) : (
          <Text role="caption" color="ink3">
            {t('voice.loading')}
          </Text>
        )}
      </View>

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
              {c.speaker === 'tutor' ? t('voice.tutorLabel') : t('voice.learnerLabel')}: {c.text}
            </Text>
          ))}
        </View>
      ) : null}

      {isBroken ? (
        <View style={styles.recovery}>
          <Text role="caption" color="warn" style={styles.recoveryText}>
            {session.limitReason ? t('voice.limitReached') : t('voice.connectionIssue')}
          </Text>
          <Button
            title={t('voice.readAlone')}
            variant="secondary"
            onPress={() => router.replace(readSeulPath)}
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  passage: {
    marginBottom: space.lg,
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
