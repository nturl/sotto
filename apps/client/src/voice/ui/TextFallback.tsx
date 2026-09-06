/**
 * TextFallback — F2 (run7/cards/F2-voice-screen.md directive 2): a text
 * field that sends a turn via `session.sendText` (already exposed by
 * `useVoiceSession`/`sessionManager`, no F1 change needed). Available
 * whenever a session is live, including mid-session recovery states, so a
 * learner without a working mic can keep the conversation going.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../i18n/useT';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';

export interface TextFallbackProps {
  onSend: (text: string) => void;
}

export function TextFallback({ onSend }: TextFallbackProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [value, setValue] = useState('');

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t('voice.textFallbackPlaceholder')}
        placeholderTextColor={colors.ink3}
        style={styles.input}
        onSubmitEditing={send}
        returnKeyType="send"
        accessibilityLabel={t('voice.textFallbackPlaceholder')}
      />
      <Pressable
        onPress={send}
        disabled={!value.trim()}
        accessibilityRole="button"
        accessibilityLabel={t('voice.textFallbackSend')}
        style={[styles.sendButton, !value.trim() && styles.sendButtonDisabled, webCursor]}
      >
        <Text role="ui" size={14} color="surface">
          {t('voice.textFallbackSend')}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: space.sm,
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.surface2,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      color: colors.ink,
      fontSize: 15,
    },
    sendButton: {
      backgroundColor: colors.ink,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
  });
}
