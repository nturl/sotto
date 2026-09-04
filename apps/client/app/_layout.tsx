import { useEffect, useState } from 'react';
import { useFonts, Fraunces_300Light, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { colors } from '@sotto/core/theme';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storeReady } from '../src/state/store';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_300Light,
    Fraunces_400Regular,
    Inter_400Regular,
    Inter_500Medium,
  });
  const [storeHydrated, setStoreHydrated] = useState(false);

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
