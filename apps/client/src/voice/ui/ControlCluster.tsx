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
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import type { VoiceState } from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import type { UserPreferences } from '@sotto/core';
import { useT } from '../../i18n/useT';
import { CloseGlyph, MicGlyph, ReplayGlyph, SpeakerGlyph, StopGlyph } from '../../ui/Glyphs';
import { IconButton } from '../../ui/IconButton';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';
import { webPressFeedback } from '../../ui/webPressFeedback';

export type TurnDetection = UserPreferences['turnDetection'];

// iOS otherwise treats a held control label as selectable page text and
// opens its Copy/Look Up menu, cancelling the microphone gesture.
const webControls = (
  Platform.OS === 'web'
    ? { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }
    : {}
) as ViewStyle;
const webHold = (Platform.OS === 'web' ? { touchAction: 'none' } : {}) as ViewStyle;

function ringColor(state: VoiceState, colors: ReturnType<typeof useTheme>['colors']): string {
  if (state === 'listening') return colors.accent;
  if (state === 'speaking' || state === 'thinking') return colors.ink;
  if (state === 'muted') return colors.ink3;
  return colors.ink2;
}

function compactStatusKey(
  voiceState: VoiceState,
  isPush: boolean,
  pttHeld: boolean,
  muted: boolean,
) {
  if (
    voiceState === 'speaking' ||
    voiceState === 'thinking' ||
    voiceState === 'connecting' ||
    voiceState === 'reconnecting' ||
    voiceState === 'error' ||
    voiceState === 'ended'
  )
    return `voice.state.${voiceState}` as const;
  if (isPush && !pttHeld) return 'voice.turnDetection.instructionPush' as const;
  return muted ? ('voice.state.muted' as const) : (`voice.state.${voiceState}` as const);
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
  /** Keeps the tutor controls within the small mobile viewport. */
  compact?: boolean;
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
  compact = false,
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
    document.addEventListener('visibilitychange', hidden);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
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
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toUpperCase();
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        !!el.isContentEditable ||
        !!el.closest?.('[role="button"], [role="radio"], a, select')
      );
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
    const cancel = () => {
      if (!held) return;
      held = false;
      pushRef.current(false);
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      cancel();
    };
  }, [isPush]);

  const microphone = isPush ? (
    <Pressable
      {...webPressFeedback}
      onBlur={() => onPushToTalk(false)}
      onPressIn={() => onPushToTalk(true)}
      onPressOut={() => onPushToTalk(false)}
      accessibilityRole="button"
      accessibilityLabel={t('voice.holdToTalk')}
      accessibilityHint={t('voice.holdToTalkHint')}
      style={({ pressed }) => [
        styles.ring,
        compact && styles.compactRing,
        webHold,
        { borderColor: ringColor(voiceState, colors) },
        pttHeld && { backgroundColor: colors.accent },
        webCursor,
        pressed && { opacity: 0.72 },
      ]}
    >
      <MicGlyph
        size={compact ? 24 : 28}
        color={pttHeld ? colors.surface : ringColor(voiceState, colors)}
      />
    </Pressable>
  ) : (
    <Pressable
      {...webPressFeedback}
      onPress={onToggleMute}
      accessibilityRole="button"
      accessibilityLabel={muted ? t('voice.unmute') : t('voice.mute')}
      style={({ pressed }) => [
        styles.ring,
        compact && styles.compactRing,
        { borderColor: ringColor(voiceState, colors) },
        muted && styles.ringMuted,
        webCursor,
        pressed && { opacity: 0.72 },
      ]}
    >
      <MicGlyph size={compact ? 24 : 28} color={ringColor(voiceState, colors)} />
    </Pressable>
  );

  if (compact) {
    return (
      <View
        style={[styles.root, styles.compactRoot, webControls]}
        {...(Platform.OS === 'web'
          ? { onContextMenu: (event: { preventDefault(): void }) => event.preventDefault() }
          : {})}
      >
        <View style={styles.compactModeRow}>
          <View style={[styles.modeToggle, styles.compactModeToggle]}>
            <Pressable
              {...webPressFeedback}
              onPress={() => onSetTurnDetection('push')}
              style={({ pressed }) => [
                styles.modeChip,
                styles.compactModeChip,
                isPush && styles.modeChipActive,
                webCursor,
                pressed && { opacity: 0.72 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isPush }}
              aria-checked={isPush}
            >
              <Text
                role="caption"
                color={isPush ? 'surface' : 'ink'}
                style={[styles.controlText, styles.compactControlText]}
              >
                {t('voice.turnDetection.push')}
              </Text>
            </Pressable>
            <Pressable
              {...webPressFeedback}
              onPress={() => onSetTurnDetection('auto')}
              style={({ pressed }) => [
                styles.modeChip,
                styles.compactModeChip,
                !isPush && styles.modeChipActive,
                webCursor,
                pressed && { opacity: 0.72 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: !isPush }}
              aria-checked={!isPush}
            >
              <Text
                role="caption"
                color={!isPush ? 'surface' : 'ink'}
                style={[styles.controlText, styles.compactControlText]}
              >
                {t('voice.turnDetection.auto')}
              </Text>
            </Pressable>
          </View>
          {isPush ? (
            <Pressable
              {...webPressFeedback}
              accessibilityRole="button"
              accessibilityLabel={muted ? t('voice.unmute') : t('voice.mute')}
              onPress={onToggleMute}
              style={({ pressed }) => [
                styles.muteButton,
                styles.compactMuteButton,
                webCursor,
                pressed && { opacity: 0.72 },
              ]}
            >
              <Text role="caption" style={[styles.controlText, styles.compactControlText]}>
                {muted ? t('voice.unmute') : t('voice.mute')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          accessibilityLiveRegion="polite"
          role="caption"
          color="ink2"
          style={[styles.controlText, styles.compactStatus]}
        >
          {t(compactStatusKey(voiceState, isPush, pttHeld, muted))}
        </Text>
        <View style={styles.compactRingRow}>
          <IconButton
            icon={<ReplayGlyph size={20} />}
            accessibilityLabel={t('voice.replay')}
            onPress={onReplay}
          />
          {microphone}
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
          <IconButton
            icon={<CloseGlyph size={20} />}
            accessibilityLabel={t('voice.end')}
            onPress={onEnd}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, webControls]}
      {...(Platform.OS === 'web'
        ? { onContextMenu: (event: { preventDefault(): void }) => event.preventDefault() }
        : {})}
    >
      <View style={styles.modeToggleRow}>
        <View style={styles.modeToggle}>
          <Pressable
            {...webPressFeedback}
            onPress={() => onSetTurnDetection('push')}
            style={({ pressed }) => [
              styles.modeChip,
              isPush && styles.modeChipActive,
              webCursor,
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isPush }}
            aria-checked={isPush}
          >
            <Text role="caption" color={isPush ? 'surface' : 'ink'} style={styles.controlText}>
              {t('voice.turnDetection.push')}
            </Text>
          </Pressable>
          <Pressable
            {...webPressFeedback}
            onPress={() => onSetTurnDetection('auto')}
            style={({ pressed }) => [
              styles.modeChip,
              !isPush && styles.modeChipActive,
              webCursor,
              pressed && { opacity: 0.72 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: !isPush }}
            aria-checked={!isPush}
          >
            <Text role="caption" color={!isPush ? 'surface' : 'ink'} style={styles.controlText}>
              {t('voice.turnDetection.auto')}
            </Text>
          </Pressable>
        </View>
        <Text role="caption" color="ink2" style={[styles.controlText, styles.modeInstruction]}>
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

        {microphone}

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
        <Pressable
          {...webPressFeedback}
          accessibilityRole="button"
          onPress={onToggleMute}
          style={({ pressed }) => [styles.muteButton, webCursor, pressed && { opacity: 0.72 }]}
        >
          <Text role="caption" style={styles.controlText}>
            {muted ? t('voice.unmute') : t('voice.mute')}
          </Text>
        </Pressable>
      ) : null}
      <Text accessibilityLiveRegion="polite" role="caption" color="ink2" style={styles.controlText}>
        {muted
          ? 'Microphone off'
          : isPush && !pttHeld
            ? 'Microphone off · hold to speak'
            : voiceState === 'error' || voiceState === 'connecting'
              ? 'Waiting for microphone permission'
              : 'Microphone enabled'}
      </Text>
      <Text role="mono" size={11} color="ink3" style={[styles.controlText, styles.stateLabel]}>
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
    compactRoot: {
      gap: space.xs,
      width: '100%',
    },
    modeToggleRow: {
      alignItems: 'center',
      gap: space.xs,
    },
    controlText: {
      userSelect: 'none',
    },
    muteButton: {
      minHeight: space.tapTarget,
      minWidth: space.tapTarget * 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
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
    compactRing: {
      width: 56,
      height: 56,
    },
    compactModeRow: {
      minHeight: space.tapTarget,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
    },
    compactModeToggle: {
      padding: 0,
      minHeight: space.tapTarget,
      minWidth: 0,
      maxWidth: '100%',
      flexShrink: 1,
    },
    compactModeChip: {
      minHeight: space.tapTarget,
      minWidth: space.tapTarget,
      flexShrink: 1,
      justifyContent: 'center',
      paddingVertical: 0,
      paddingHorizontal: space.sm,
    },
    compactMuteButton: {
      minHeight: space.tapTarget,
      minWidth: space.tapTarget,
      paddingHorizontal: space.sm,
    },
    compactControlText: {
      fontSize: 12,
      textAlign: 'center',
    },
    compactStatus: {
      minHeight: 16,
      textAlign: 'center',
      fontSize: 12,
    },
    compactRingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
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
