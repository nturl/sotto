import { Tabs } from 'expo-router';
import { TabBar, type TabBarProps } from '../../src/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="vocabulary" />
    </Tabs>
  );
}
