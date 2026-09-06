/**
 * Not-found screen (CONFIRM 25 / card B, directive 5): Expo Router's
 * builtin fallback for any route that doesn't match — reachable by hitting
 * `/settings` before lane E lands `app/settings/index.tsx`, `/profile/x`,
 * or any other typo'd path. Always offers a way back to Home and Library
 * (`NOT_FOUND_LINKS`, `src/ui/notFoundLinks.ts` — kept out of `app/` so its
 * test file doesn't get treated as a route; see that module's comment).
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@sotto/core/theme';
import { useT } from '../src/i18n/useT';
import { Button } from '../src/ui/Button';
import { NOT_FOUND_LINKS } from '../src/ui/notFoundLinks';
import { Shell } from '../src/ui/Shell';
import { Text } from '../src/ui/Text';

export default function NotFoundScreen() {
  const t = useT();
  const router = useRouter();

  return (
    <Shell sidebar={false}>
      <View style={styles.body}>
        <Text role="display" size={22}>
          {t('notFound.title')}
        </Text>
        <View style={styles.actions}>
          {NOT_FOUND_LINKS.map((link) => (
            <Button
              key={link.href}
              variant="secondary"
              title={t(link.labelKey)}
              onPress={() => router.replace(link.href)}
            />
          ))}
        </View>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.xl,
    alignItems: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
  },
});
