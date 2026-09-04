/**
 * SectionEyebrow — mono label, 11px, uppercase, tracking 0.08em, ink-3.
 */
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Text } from './Text';

export function SectionEyebrow({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text role="mono" color="ink3" style={[styles.eyebrow, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    textTransform: 'uppercase',
  },
});
