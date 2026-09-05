import { useEffect, useState } from 'react';
import { useFonts, Fraunces_300Light, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { colors } from '@sotto/core/theme';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storeReady } from '../src/state/store';

/** A3 (PWA, OVERNIGHT-2.md Lane A): registers public/sw.js on web, in
 * production builds only — never in `expo start --web` dev, where the
 * bundle has no stable content to precache and a stray SW would just get
 * in the way of iterating. */
function useServiceWorkerRegistration() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (process.env.NODE_ENV !== 'production') return;
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (!nav?.serviceWorker) return;
    void nav.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort: an unavailable SW (e.g. served over http in local
      // testing) should never block the app from loading.
    });
  }, []);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_300Light,
    Fraunces_400Regular,
    Inter_400Regular,
    Inter_500Medium,
  });
  const [storeHydrated, setStoreHydrated] = useState(false);

  useServiceWorkerRegistration();

  useEffect(() => {
    void storeReady.then(() => setStoreHydrated(true));
  }, []);

  if (!fontsLoaded || !storeHydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </SafeAreaProvider>
  );
}
