import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

export default function FeedbackScreen() {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const { colors } = useTheme();
  const openDraft = async () => {
    try {
      await Linking.openURL(
        `mailto:nturl505@gmail.com?subject=${encodeURIComponent('Sotto feedback')}&body=${encodeURIComponent(message.trim())}`,
      );
      setStatus('Email draft opened. Send it in your mail app. Sotto cannot confirm delivery.');
    } catch {
      setStatus('Could not open your mail app. Email your report to nturl505@gmail.com.');
    }
  };
  return (
    <Shell>
      <BackLink />
      <View style={{ gap: space.md }}>
        <Text role="display">Send feedback</Text>
        <Text role="ui">
          Describe what happened and what you expected. Do not include API keys or payment details.
          Only the text you write is added to the email; your mail app supplies your sender address.
        </Text>
        <TextInput
          multiline
          accessibilityLabel="Feedback"
          value={message}
          onChangeText={setMessage}
          style={{
            minHeight: 160,
            padding: space.md,
            borderWidth: 1,
            borderColor: colors.hairline,
            color: colors.ink,
          }}
        />
        <Button
          title="Open email draft"
          disabled={!message.trim()}
          onPress={() => void openDraft()}
        />
        <Text role="caption" accessibilityLiveRegion="polite">
          {status}
        </Text>
      </View>
    </Shell>
  );
}
