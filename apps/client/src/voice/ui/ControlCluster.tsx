/**
 * ControlCluster — F2 (run7/cards/F2-voice-screen.md directive 1 & 2): the
 * voice screen's single bottom control area. Noel's complaint was a status
 * dot in one corner, a dead-end caption in another, and icon buttons in a
 * third — "nothing to press" for push-to-talk. This puts everything one
 * hand can reach in one place: the input-mode toggle (with its own
 * instruction line, replacing the old `voice.pttDisabled` dead end — it
 * now writes `preferences.turnDetection` in place, directive 1), the mic
 * ring itself (states: ready/connecting/listening/thinking/speaking/muted,
 * directive 3), and Replay / Stop / End.
 *
 * Run 9 lane D directive 1: the ring is rendered in every state this
 * cluster is mounted for — including `speaking` (the run-9 screenshots at
 * 375 and 1440 confirm it; PLAN.md diagnosis 4's hidden-mic reading is
 * refuted in planning/run9/D-report.md). What it gained this run is
 * keyboard hold-to-talk on web (space held, the same press/release the
 * mouse and touch handlers already produce), because a 72 px ring you can
 * only reach with a pointer is not "always usable".
 *
 * Speaker (tutor output) mute (run7/G directive 1(a), finishing what F2
 * flagged as blocked on an interface it didn't own): a standing toggle that
 * silences tutor TTS playback via `VoiceProvider.setOutputMuted` — distinct
 * from capture-mute (the ring/toggle above) and from Stop (one-shot
 * barge-in).
 */
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { VoiceState } from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import type { UserPreferences } from '@sotto/core';
import { useT } from '../../i18n/useT';
import { CloseGlyph, MicGlyph, ReplayGlyph, SpeakerGlyph, StopGlyph } from '../../ui/Glyphs';
import { IconButton } from '../../ui/IconButton';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';

export type TurnDetection = UserPreferences['turnDetection'];

function ringColor(state: VoiceState, colors: ReturnType<typeof useTheme>['colors']): string {
  if (state === 'listening') return colors.accent;
  if (state === 'speaking' || state === 'thinking') return colors.ink;
  if (state === 'muted') return colors.ink3;
  return colors.ink2;
}

export interface ControlClusterProps {
  voiceState: VoiceState;
  inputMuted: boolean;
  turnDetection: TurnDetection;
  onSetTurnDetection: (next: TurnDetection) => void;
  pttHeld: boolean;
  onPushToTalk: (active: boolean) => void;
  onToggleMute: () => void;
  onReplay: () => void;
  onInterrupt: () => void;
  onEnd: () => void;
  /** run7/G directive 1(a): whether tutor speech playback is currently
   * silenced (capture keeps running either way). */
  outputMuted: boolean;
  onToggleOutputMuted: () => void;
}

export function ControlCluster({
  voiceState,
  inputMuted,
  turnDetection,
  onSetTurnDetection,
  pttHeld,
  onPushToTalk,
  onToggleMute,
  onReplay,
  onInterrupt,
  onEnd,
  outputMuted,
  onToggleOutputMuted,
}: ControlClusterProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isPush = turnDetection === 'push';
  const muted = inputMuted;
  const release = useRef(onPushToTalk);
  release.current = onPushToTalk;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stop = () => release.current(false);
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('blur', stop);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keyup', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keyup', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  // Space-held push-to-talk (web). Kept in a ref so the listener is
  // registered once per mode change rather than re-registered on every
  // render (the screen passes a fresh inline handler each time), and so a
  // key held when this unmounts still releases capture.
  const pushRef = useRef(onPushToTalk);
  pushRef.current = onPushToTalk;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !isPush) return undefined;
    let held = false;
    // The text fallback sits right under this cluster: a space typed into
    // it (or into any other field/button) is a space, not a mic press.
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as { tagName?: string; isContentEditable?: boolean } | null;
      if (!el) return false;
      const tag = el.tagName?.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || !!el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || held || isTyping(e.target)) return;
      e.preventDefault();
      held = true;
      pushRef.current(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !held) return;
      e.preventDefault();
      held = false;
      pushRef.current(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (held) pushRef.current(false);
    };
  }, [isPush]);

  return (
    <View style={styles.root}>
      <View style={styles.modeToggleRow}>
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => onSetTurnDetection('push')}
            style={[styles.modeChip, isPush && styles.modeChipActive, webCursor]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isPush }}
            aria-checked={isPush}
          >
            <Text role="caption" color={isPush ? 'surface' : 'ink'}>
              {t('voice.turnDetection.push')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onSetTurnDetection('auto')}
            style={[styles.modeChip, !isPush && styles.modeChipActive, webCursor]}
            accessibilityRole="radio"
            accessibilityState={{ checked: !isPush }}
            aria-checked={!isPush}
          >
            <Text role="caption" color={!isPush ? 'surface' : 'ink'}>
              {t('voice.turnDetection.auto')}
            </Text>
          </Pressable>
        </View>
        <Text role="caption" color="ink2" style={styles.modeInstruction}>
          {isPush
            ? t('voice.turnDetection.instructionPush')
            : t('voice.turnDetection.instructionAuto')}
        </Text>
      </View>

      <View style={styles.ringRow}>
        <IconButton
          icon={<ReplayGlyph size={20} />}
          accessibilityLabel={t('voice.replay')}
          onPress={onReplay}
        />

        {isPush ? (
          <Pressable
            disabled={muted}
            accessibilityState={{ disabled: muted }}
            onBlur={() => onPushToTalk(false)}
            {...(Platform.OS === 'web'
              ? {
                  onKeyDown: (event: { key: string; repeat: boolean; preventDefault(): void }) => {
                    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                      event.preventDefault();
                      if (!muted) onPushToTalk(true);
                    }
                  },
                  onKeyUp: (event: { key: string; preventDefault(): void }) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      onPushToTalk(false);
                    }
                  },
                }
              : {})}
            onPressIn={() => onPushToTalk(true)}
            onPressOut={() => onPushToTalk(false)}
            accessibilityRole="button"
            accessibilityLabel={t('voice.holdToTalk')}
            accessibilityHint={t('voice.holdToTalkHint')}
            style={[
              styles.ring,
              { borderColor: ringColor(voiceState, colors) },
              pttHeld && { backgroundColor: colors.accent },
              webCursor,
            ]}
          >
            <MicGlyph size={28} color={pttHeld ? colors.surface : ringColor(voiceState, colors)} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onToggleMute}
            accessibilityRole="button"
            accessibilityLabel={muted ? t('voice.unmute') : t('voice.mute')}
            style={[
              styles.ring,
              { borderColor: ringColor(voiceState, colors) },
              muted && styles.ringMuted,
              webCursor,
            ]}
          >
            <MicGlyph size={28} color={ringColor(voiceState, colors)} />
          </Pressable>
        )}

        <IconButton
          icon={<StopGlyph size={20} />}
          accessibilityLabel={t('voice.interrupt')}
          onPress={onInterrupt}
        />

        <IconButton
          icon={<SpeakerGlyph size={20} color={outputMuted ? colors.ink3 : colors.ink} />}
          accessibilityLabel={outputMuted ? t('voice.unmuteSpeaker') : t('voice.muteSpeaker')}
          onPress={onToggleOutputMuted}
        />
      </View>

      {isPush ? (
        <Pressable accessibilityRole="button" onPress={onToggleMute}>
          <Text role="caption">{muted ? t('voice.unmute') : t('voice.mute')}</Text>
        </Pressable>
      ) : null}
      <Text accessibilityLiveRegion="polite" role="caption" color="ink2">
        {muted
          ? 'Microphone off'
          : isPush && !pttHeld
            ? 'Microphone off · hold to speak'
            : voiceState === 'error' || voiceState === 'connecting'
              ? 'Waiting for microphone permission'
              : 'Microphone enabled'}
      </Text>
      <Text role="mono" size={11} color="ink3" style={styles.stateLabel}>
        {t(`voice.state.${voiceState}` as const)}
      </Text>

      <IconButton
        icon={<CloseGlyph size={20} />}
        accessibilityLabel={t('voice.end')}
        onPress={onEnd}
        style={styles.endButton}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      alignItems: 'center',
      gap: space.sm,
    },
    modeToggleRow: {
      alignItems: 'center',
      gap: space.xs,
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      padding: 2,
    },
    modeChip: {
      paddingVertical: space.xs,
      paddingHorizontal: space.md,
      borderRadius: radius.md - 2,
    },
    modeChipActive: {
      backgroundColor: colors.ink,
    },
    modeInstruction: {
      textAlign: 'center',
    },
    ringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xl,
    },
    ring: {
      width: 72,
      height: 72,
      borderRadius: radius.full,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringMuted: {
      opacity: 0.5,
    },
    stateLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    endButton: {
      marginTop: space.xs,
    },
  });
}
