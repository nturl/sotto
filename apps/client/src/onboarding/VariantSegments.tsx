/**
 * The region/script control that opens under the selected language row
 * (run 10 lane A).
 *
 * Collapsing "English" and "English (UK)" into one row moves the choice
 * between them somewhere, and the app already has a device for exactly this
 * shape of choice: the Library's level scale (`src/ui/LevelScale.tsx`,
 * DESIGN.md "Library"). One hairline-2 bordered box, radius 10 on the box
 * and nothing inside it, dividers between segments, the selected segment
 * filled with ink and lettered in surface. Same look here, with word labels
 * instead of CEFR codes and a 44px tap target, since this one is pressed by
 * a thumb on a phone.
 *
 * Accent stays out of it: DESIGN.md gives accent to the primary CTA, and the
 * selected segment is ink.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { webCursor } from '../ui/tokens';

export type VariantSegment = { value: string; label: string };

export type VariantSegmentsProps = {
  segments: readonly VariantSegment[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group (the level scale's `aria-label`). */
  groupLabel: string;
};

export function VariantSegments({ segments, value, onChange, groupLabel }: VariantSegmentsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={groupLabel} style={styles.group}>
      {segments.map((segment, index) => {
        const on = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="radio"
            // react-native-web 0.21 dropped the `accessibilityState` ->
            // `aria-*` mapping, so without this the DOM radio never reports
            // which segment is on. `accessibilityState` stays for native.
            aria-checked={on}
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={segment.label}
            style={[
              styles.segment,
              index < segments.length - 1 ? styles.divider : null,
              on ? styles.segmentOn : null,
              webCursor,
            ]}
          >
            <Text role="ui" size={13} color={on ? 'surface' : 'ink'}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    group: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline2,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    segment: {
      minHeight: space.tapTarget,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: {
      borderRightWidth: 1,
      borderRightColor: colors.hairline2,
    },
    segmentOn: {
      backgroundColor: colors.ink,
    },
  });
}
