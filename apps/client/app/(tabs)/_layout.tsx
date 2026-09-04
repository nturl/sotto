import { Tabs } from 'expo-router';
import { colors } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';

export default function TabsLayout() {
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink2,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library') }} />
      <Tabs.Screen name="vocabulary" options={{ title: t('tabs.vocabulary') }} />
    </Tabs>
  );
}
