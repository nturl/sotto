/**
 * WS-0 scaffold placeholder — a centered title in the canvas + Fraunces
 * theme, nothing else. WS-2/WS-4 replace each route's content with the real
 * screen; this only exists so navigation compiles end to end.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type } from '@sotto/core/theme';
import { useTheme } from './theme';

export function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.canvas,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    title: {
      fontFamily: 'Fraunces_300Light',
      fontSize: type.display.size,
      lineHeight: type.display.size * type.display.lineHeight,
      color: colors.ink,
      textAlign: 'center',
    },
  });
}
