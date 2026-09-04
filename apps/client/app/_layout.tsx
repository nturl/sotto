import { useFonts, Fraunces_300Light, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { colors } from '@sotto/core/theme';
import { View } from 'react-native';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_300Light,
    Fraunces_400Regular,
    Inter_400Regular,
    Inter_500Medium,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
