/**
 * GroupList — the grouped-card list device Profile originated (mono
 * `SectionEyebrow` + a `surface`/hairline card of `Row`s with dividers).
 * Extracted out of `app/profile.tsx` so `app/account/index.tsx` (ACCOUNT.md
 * §0/§2: "reuses the same Group/Row structural components as Profile") uses
 * the identical component rather than a copy-pasted lookalike. Profile
 * itself now imports from here instead of defining its own.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { ChevronRightGlyph } from './Glyphs';
import { Text } from './Text';
import { SectionEyebrow } from './SectionEyebrow';
import { useTheme } from './theme';
import { webCursor } from './tokens';

export type RowSpec = {
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
};

export function Row({ spec, last }: { spec: RowSpec; last: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <>
      <Text role="ui" size={15} color={spec.destructive ? 'warn' : undefined}>
        {spec.label}
      </Text>
      <View style={styles.rowValue}>
        {spec.value ? (
          <Text role="caption" size={14} color={spec.destructive ? 'warn' : 'ink2'}>
            {spec.value}
          </Text>
        ) : null}
        {spec.onPress && !spec.destructive ? (
          <ChevronRightGlyph size={12} color={colors.ink2} />
        ) : null}
      </View>
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowDivider];
  if (!spec.onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={spec.onPress}
      accessibilityRole="button"
      accessibilityLabel={spec.label}
      style={[rowStyle, webCursor]}
    >
      {content}
    </Pressable>
  );
}

export function Group({ eyebrow, rows }: { eyebrow?: string; rows: RowSpec[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.group}>
      {eyebrow ? <SectionEyebrow style={styles.eyebrow}>{eyebrow}</SectionEyebrow> : null}
      <View style={styles.groupCard}>
        {rows.map((row, index) => (
          <Row key={row.label} spec={row} last={index === rows.length - 1} />
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    group: {
      gap: 10,
    },
    eyebrow: {
      marginLeft: space.xs,
    },
    groupCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: space.lg,
      minHeight: space.tapTarget,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    rowValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
  });
}
