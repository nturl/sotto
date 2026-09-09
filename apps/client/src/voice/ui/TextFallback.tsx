/**
 * TextFallback — F2 (run7/cards/F2-voice-screen.md directive 2): a text
 * field that sends a turn via `session.sendText` (already exposed by
 * `useVoiceSession`/`sessionManager`, no F1 change needed). Available
 * whenever a session is live, including mid-session recovery states, so a
 * learner without a working mic can keep the conversation going.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../i18n/useT';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';
import { webPressFeedback } from '../../ui/webPressFeedback';

export interface TextFallbackProps {
  onSend: (text: string) => void;
  /**
   * Run 9 lane D directive 2: the transcript's "Not what you said? Type
   * it" affordance drops what STT heard into this field and focuses it, so
   * the learner edits a wrong transcript instead of retyping the turn.
   * `nonce` is what makes a second tap on the same caption re-apply.
   */
  prefill?: { text: string; nonce: number };
}

export function TextFallback({ onSend, prefill }: TextFallbackProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  const nonce = prefill?.nonce ?? 0;
  const prefillText = prefill?.text ?? '';
  useEffect(() => {
    if (nonce === 0) return;
    setValue(prefillText);
    inputRef.current?.focus();
    // Only a fresh tap (a new nonce) re-prefills — editing the field must
    // not be undone by this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        ref={inputRef}
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
        {...webPressFeedback}
        onPress={send}
        disabled={!value.trim()}
        accessibilityRole="button"
        accessibilityLabel={t('voice.textFallbackSend')}
        style={({ pressed }) => [
          styles.sendButton,
          !value.trim() && styles.sendButtonDisabled,
          webCursor,
          pressed && { opacity: 0.72 },
        ]}
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
