/**
 * RecoveryView — F2 (run7/cards/F2-voice-screen.md directive 5): renders
 * whatever `recoveryPanelFor` (the pure, unit-tested mapping) decided for
 * the current failure. `tryAgain` calls `session.retry` and
 * `resumePlayback` calls `session.resumePlayback` — both new
 * `sessionManager` exports F1 published mid-lane (planning/run7/F1-
 * report.md); `retry` re-enters the same book/chapter/mode without
 * clearing the transcript, `resumePlayback` calls the provider's
 * `resumePlayback()` for a `playback_blocked` error.
 */
import { StyleSheet, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { useRouter } from 'expo-router';
import { useT, type MessageKey } from '../../i18n/useT';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import type { RecoveryButton, RecoverySpec } from './recoveryPanel';

export interface RecoveryViewProps {
  spec: RecoverySpec;
  onTryAgain: () => void;
  /** Starts over after a `max_duration` limit — the screen's `session.start`,
   * which ends the spent session (clearing the transcript) before beginning. */
  onNewSession: () => void;
  onResumePlayback: () => void;
  onReadAlone: () => void;
  message?: string;
}

export function RecoveryView({
  spec,
  onTryAgain,
  onNewSession,
  onResumePlayback,
  onReadAlone,
  message,
}: RecoveryViewProps) {
  const t = useT();
  const router = useRouter();

  const actionFor = (button: RecoveryButton) => {
    switch (button) {
      case 'tryAgain':
        return { title: t('voice.tryAgain'), onPress: onTryAgain, variant: 'primary' as const };
      case 'continue':
        return { title: t('voice.continue'), onPress: onTryAgain, variant: 'primary' as const };
      case 'newSession':
        return { title: t('voice.newSession'), onPress: onNewSession, variant: 'primary' as const };
      case 'resumePlayback':
        return {
          title: t('voice.recovery.resumePlaybackAction'),
          onPress: onResumePlayback,
          variant: 'primary' as const,
        };
      case 'settings':
        return {
          title: t('byok.row'),
          onPress: () => router.push('/settings/openai-key'),
          variant: 'secondary' as const,
        };
      case 'plans':
        return {
          title: t('voice.seePlans'),
          onPress: () => router.push('/paywall'),
          variant: 'primary' as const,
        };
      case 'readAlone':
        return { title: t('voice.readAlone'), onPress: onReadAlone, variant: 'secondary' as const };
    }
  };

  return (
    <View style={styles.root}>
      <Text role="caption" color="warn" style={styles.text}>
        {message ?? t(spec.messageKey as MessageKey)}
      </Text>
      {spec.hintKey ? (
        <Text role="caption" color="ink3" style={styles.text}>
          {t(spec.hintKey as MessageKey)}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {spec.buttons.map((b) => {
          const action = actionFor(b);
          return (
            <Button
              key={b}
              title={action.title}
              variant={action.variant}
              onPress={action.onPress}
              style={styles.button}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: space.md,
  },
  text: {
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  button: {
    minWidth: 140,
  },
});
