import { useEffect, useState } from 'react';
import { useFonts, Fraunces_300Light, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@sotto/core/theme';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storeReady } from '../src/state/store';
import { ThemeProvider, useTheme } from '../src/ui/theme';

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

/** Status bar content follows the active scheme (DESIGN.md dark-mode task):
 * dark content on the light canvas, light content on the dark canvas. Must
 * live inside ThemeProvider to read the resolved scheme. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
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
      <ThemeProvider>
        <ThemedStatusBar />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
