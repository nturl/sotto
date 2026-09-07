/**
 * LevelScale — the Library's CEFR level filter as one hairline-segmented
 * group (mockup `.scale` / `.scale span(.on)`, `app-mockup-v2.html:89-92`,
 * phone override `:353`).
 *
 * Run 8 PLAN decision 9 splits run 7's single flat chip row into a level
 * scale and a collection row; this is the level half. No pills: one bordered
 * group, `hairline2` dividers between segments, the selected segment filled
 * with ink and lettered in surface. It is a radio group, not a set of
 * buttons — exactly one segment is on at a time and "All" is the unset
 * state.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius } from '@sotto/core/theme';
import type { BookLevel } from '@sotto/core';
import { fonts } from './fonts';
import { Text } from './Text';
import { useTheme } from './theme';
import { webCursor } from './tokens';

export type LevelScaleProps = {
  levels: readonly BookLevel[];
  /** `undefined` = All. */
  value: BookLevel | undefined;
  onChange: (next: BookLevel | undefined) => void;
  allLabel: string;
  /** Accessible name for the group (the mockup's `aria-label="Level"`). */
  groupLabel: string;
  /** Phone sizing: `.pmain .scale span` is 8/9 padding at 11px. */
  compact?: boolean;
};

export function LevelScale({
  levels,
  value,
  onChange,
  allLabel,
  groupLabel,
  compact = false,
}: LevelScaleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const size = compact ? 11 : 12;
  const segments: Array<{ key: string; label: string; level: BookLevel | undefined }> = [
    { key: 'all', label: allLabel, level: undefined },
    ...levels.map((level) => ({ key: level, label: level, level })),
  ];

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={groupLabel} style={styles.scale}>
      {segments.map((segment, index) => {
        const on = segment.level === value;
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.level)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={segment.label}
            style={[
              styles.segment,
              compact ? styles.segmentCompact : null,
              index < segments.length - 1 ? styles.divider : null,
              on ? styles.segmentOn : null,
              webCursor,
            ]}
          >
            <Text
              role="mono"
              size={size}
              color={on ? 'surface' : 'ink2'}
              // Mockup `.scale span`: mono 12/1 at .06em, not the mono
              // role's default .08em.
              style={[styles.label, { letterSpacing: size * 0.06 }]}
            >
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
    scale: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.hairline2,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    segment: {
      paddingVertical: 8,
      paddingHorizontal: 13,
      justifyContent: 'center',
    },
    segmentCompact: {
      paddingHorizontal: 9,
    },
    divider: {
      borderRightWidth: 1,
      borderRightColor: colors.hairline2,
    },
    segmentOn: {
      backgroundColor: colors.ink,
    },
    label: {
      fontFamily: fonts.mono,
    },
  });
}
