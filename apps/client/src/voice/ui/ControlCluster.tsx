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
 * No speaker (tutor output) mute here — see F2-report.md's "not shipped"
 * section: no interface exists yet to mute tutor TTS playback specifically
 * (only capture-mute and barge-in/Stop, which are different actions), and
 * this lane doesn't own the files (`packages/voice`) that would need one.
 * Shipping a button that looks like a working mute but silently does
 * nothing would recreate the exact "nothing to press" complaint this
 * screen exists to fix.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { VoiceState } from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import type { UserPreferences } from '@sotto/core';
import { useT } from '../../i18n/useT';
import { CloseGlyph, MicGlyph, ReplayGlyph, StopGlyph } from '../../ui/Glyphs';
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
  turnDetection: TurnDetection;
  onSetTurnDetection: (next: TurnDetection) => void;
  pttHeld: boolean;
  onPushToTalk: (active: boolean) => void;
  onToggleMute: () => void;
  onReplay: () => void;
  onInterrupt: () => void;
  onEnd: () => void;
}

export function ControlCluster({
  voiceState,
  turnDetection,
  onSetTurnDetection,
  pttHeld,
  onPushToTalk,
  onToggleMute,
  onReplay,
  onInterrupt,
  onEnd,
}: ControlClusterProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isPush = turnDetection === 'push';
  const muted = voiceState === 'muted';

  return (
    <View style={styles.root}>
      <View style={styles.modeToggleRow}>
        <View style={styles.modeToggle}>
          <Pressable
            onPress={() => onSetTurnDetection('push')}
            style={[styles.modeChip, isPush && styles.modeChipActive, webCursor]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isPush }}
          >
            <Text role="caption" color={isPush ? 'surface' : 'ink'}>
              {t('voice.turnDetection.push')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onSetTurnDetection('auto')}
            style={[styles.modeChip, !isPush && styles.modeChipActive, webCursor]}
            accessibilityRole="radio"
            accessibilityState={{ selected: !isPush }}
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
            onPressIn={() => onPushToTalk(true)}
            onPressOut={() => onPushToTalk(false)}
            accessibilityRole="button"
            accessibilityLabel={t('voice.holdToTalk')}
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
      </View>

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
