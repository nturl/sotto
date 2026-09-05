/**
 * Shell — layout wrapper for screens. Phone: canvas with a 20px gutter
 * (32px tablet). Desktop >= 900px: 220px sidebar replaces the tab bar;
 * content centers in the space right of the sidebar, at two tiers
 * (DESKTOP.md §1 — no new color/radius token, both max-widths and the
 * >=1200 gutter/padding are the pre-existing space.xxl/xxxl/gutter values
 * reused for a second breakpoint tier):
 *   900-1199: max-width 760, 32px gutters, 32px top padding
 *   >= 1200:  max-width 1040, 48px gutters, 48px top padding
 * Also injects the web-only :focus-visible outline (2px ink, follows the
 * active scheme) and keeps the web <body> background in sync with the
 * active scheme's canvas color (so overscroll/rubber-band never flashes a
 * static light background) once per session.
 */
import { useEffect, useMemo } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@sotto/core/theme';
import { useTheme } from './theme';
import { Sidebar } from './Sidebar';

export const DESKTOP_BREAKPOINT = 900;
/** DESKTOP.md §1's second desktop tier — content region widens from 760 to
 * 1040 and gutters/top padding step from 32 to 48 above this width. */
export const DESKTOP_WIDE_BREAKPOINT = 1200;

/** Web-only: 2px focus-visible outline + <body> background, kept in sync
 * with the active scheme. Injected/updated (not just created once) so a
 * live Appearance change repaints both immediately. */
type WebDocument = {
  getElementById(id: string): { textContent: string } | null;
  createElement(tag: string): { id: string; textContent: string };
  head: { appendChild(node: unknown): void };
  body: { style: { backgroundColor: string } };
};

function FocusOutlineStyle({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = (globalThis as { document?: WebDocument }).document;
    if (!doc) return;
    const id = 'sotto-focus-outline';
    let element = doc.getElementById(id);
    if (!element) {
      const created = doc.createElement('style');
      created.id = id;
      doc.head.appendChild(created);
      element = created;
    }
    element.textContent = `*:focus-visible{outline:2px solid ${colors.ink};outline-offset:2px;}`;
    doc.body.style.backgroundColor = colors.canvas;
  }, [colors]);
  return null;
}

export type ShellProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Extra bottom padding (e.g. to clear a pinned footer). */
  contentBottomPadding?: number;
  /** False for onboarding (ADVERSARIAL-REVIEW.md design-drift list): the
   * desktop sidebar is the (tabs) app's own navigation, and must not wrap a
   * screen the learner reaches before that app shell has anything to show
   * (no book library yet, no settled preferences) — onboarding stays a
   * plain canvas screen at every width. Default true for every other Shell
   * caller (book detail, profile, review, search, licences, settings). */
  sidebar?: boolean;
};

export function useLayoutMetrics() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isWideDesktop = width >= DESKTOP_WIDE_BREAKPOINT;
  const gutter = isWideDesktop
    ? space.gutter.desktop
    : isDesktop
      ? space.gutter.tablet // reused for the 900-1199 tier's 32px gutter, not actual tablet width
      : width >= 600
        ? space.gutter.tablet
        : space.gutter.phone;
  const sectionGap = isDesktop ? space.sectionRhythm.desktop : space.sectionRhythm.phone;
  return { width, isDesktop, isWideDesktop, gutter, sectionGap };
}

export function Shell({
  children,
  scroll = true,
  contentStyle,
  contentBottomPadding = space.xl,
  sidebar = true,
}: ShellProps) {
  const insets = useSafeAreaInsets();
  const { isDesktop, isWideDesktop, gutter } = useLayoutMetrics();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // DESKTOP.md §8: onboarding (sidebar=false) is a centered 560px column at
  // >= 900, vertically centered — never the app shell's 760/1040 tiers.
  const desktopMaxWidth = !sidebar ? 560 : isWideDesktop ? 1040 : 760;
  const desktopTopPadding = isWideDesktop ? space.xxxl : space.xxl;

  // Onboarding centers on desktop (DESKTOP.md §8): the content box must
  // size to its own content, not flex to fill the viewport, or the outer
  // ScrollView's justifyContent:'center' (styles.centerGrow) has nothing
  // to center — an always-full-height box is already "centered" trivially.
  const isCenteredOnboarding = isDesktop && !sidebar;

  const content = (
    <View
      style={[
        styles.content,
        isCenteredOnboarding && styles.contentAuto,
        {
          maxWidth: isDesktop ? desktopMaxWidth : undefined,
          paddingHorizontal: gutter,
          paddingTop: isDesktop && sidebar ? desktopTopPadding : space.xl,
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
      <FocusOutlineStyle colors={colors} />
      <View style={styles.row}>
        {isDesktop && sidebar ? <Sidebar /> : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={isDesktop && !sidebar ? styles.centerGrow : styles.grow}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{content}</View>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
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
    // DESKTOP.md §8: onboarding is vertically centered at >= 900, not
    // top-anchored like the app shell's other screens.
    centerGrow: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    content: {
      flexGrow: 1,
      width: '100%',
      alignSelf: 'center',
    },
    contentAuto: {
      flexGrow: 0,
    },
  });
}
