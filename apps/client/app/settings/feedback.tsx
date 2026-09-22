import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { Button } from '../../src/ui/Button';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

// The maintainer's own inbox. Named once so the failure message can
// interpolate it rather than baking the address into nine catalogs; the
// mail subject stays English because it lands in that inbox, not on screen.
const FEEDBACK_EMAIL = 'nturl505@gmail.com';

export default function FeedbackScreen() {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const { colors } = useTheme();
  const t = useT();
  const openDraft = async () => {
    try {
      await Linking.openURL(
        `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Sotto feedback')}&body=${encodeURIComponent(message.trim())}`,
      );
      setStatus(t('settings.feedback.opened'));
    } catch {
      setStatus(t('settings.feedback.mailAppFailed', { email: FEEDBACK_EMAIL }));
    }
  };
  return (
    <Shell>
      <BackLink />
      <View style={{ gap: space.md }}>
        <Text role="display">{t('settings.feedback')}</Text>
        <Text role="ui">{t('settings.feedback.intro')}</Text>
        <TextInput
          multiline
          accessibilityLabel={t('settings.feedback.inputLabel')}
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
          title={t('settings.feedback.openDraft')}
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
