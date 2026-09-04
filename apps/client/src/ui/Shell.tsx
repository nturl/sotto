/**
 * Shell — layout wrapper for screens. Phone: canvas with a 20px gutter
 * (32px tablet). Desktop >= 900px: 220px sidebar replaces the tab bar and
 * content centers at max-width 1100 with 48px gutters. Also injects the
 * web-only :focus-visible outline (2px ink) once per session.
 */
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '@sotto/core/theme';
import { Sidebar } from './Sidebar';

export const DESKTOP_BREAKPOINT = 900;
export const CONTENT_MAX_WIDTH = 1100;

/** Web-only: 2px ink focus-visible outline, injected once into <head>. */
type WebDocument = {
  getElementById(id: string): unknown;
  createElement(tag: string): { id: string; textContent: string };
  head: { appendChild(node: unknown): void };
};

function FocusOutlineStyle() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = (globalThis as { document?: WebDocument }).document;
    if (!doc) return;
    const id = 'sotto-focus-outline';
    if (doc.getElementById(id)) return;
    const element = doc.createElement('style');
    element.id = id;
    element.textContent = `*:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px;}`;
    doc.head.appendChild(element);
  }, []);
  return null;
}

export type ShellProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Extra bottom padding (e.g. to clear a pinned footer). */
  contentBottomPadding?: number;
};

export function useLayoutMetrics() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const gutter = isDesktop ? space.gutter.desktop : width >= 600 ? space.gutter.tablet : space.gutter.phone;
  const sectionGap = isDesktop ? space.sectionRhythm.desktop : space.sectionRhythm.phone;
  return { width, isDesktop, gutter, sectionGap };
}

export function Shell({ children, scroll = true, contentStyle, contentBottomPadding = space.xl }: ShellProps) {
  const insets = useSafeAreaInsets();
  const { isDesktop, gutter } = useLayoutMetrics();

  const content = (
    <View
      style={[
        styles.content,
        {
          maxWidth: isDesktop ? CONTENT_MAX_WIDTH : undefined,
          paddingHorizontal: gutter,
          paddingTop: space.xl,
          paddingBottom: contentBottomPadding + (isDesktop ? 0 : insets.bottom),
        },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: isDesktop ? 0 : insets.top }]}>
      <FocusOutlineStyle />
      <View style={styles.row}>
        {isDesktop ? <Sidebar /> : null}
        {scroll ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.grow} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{content}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
  },
});
