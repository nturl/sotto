/**
 * SessionBar — DESIGN.md "Navigation": 56px surface bar above the tab bar,
 * hairline top, cover thumb 32x48 with a 2px cutout, title + mode, mono
 * state word, one control (mute/resume). Shown while a voice session is
 * active/paused (CONTRACTS §4 session slice, TASK §E). Tap returns to
 * /voice/[bookId]; the session itself lives in sessionManager and keeps
 * running whether or not this bar (or the voice screen) is mounted.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { setMuted } from '../voice/sessionManager';
import { Cover } from './Cover';
import { useLibrary } from './data';
import { MuteGlyph } from './Glyphs';
import { IconButton } from './IconButton';
import { useSottoStore } from '../state/store';
import { Text } from './Text';
import { webCursor } from './tokens';

export function SessionBar() {
  const t = useT();
  const router = useRouter();
  const library = useLibrary();
  const sessionRecord = useSottoStore((s) => s.sessionRecord);
  const voiceState = useSottoStore((s) => s.voiceState);

  if (!sessionRecord || (sessionRecord.status !== 'active' && sessionRecord.status !== 'paused'))
    return null;

  const book = library.byId(sessionRecord.bookId);
  if (!book) return null;

  return (
    <View style={styles.bar}>
      {/* A separate Pressable, not the whole bar — the mute IconButton
          below is also a Pressable (renders <button> on web), and RNW
          doesn't allow nesting one inside another. */}
      <Pressable
        onPress={() => router.push(`/voice/${sessionRecord.bookId}`)}
        accessibilityRole="button"
        accessibilityLabel={`${book.title} — ${t(`voice.mode.${sessionRecord.mode}` as const)}`}
        style={[styles.tapArea, webCursor]}
      >
        <Cover
          art={book.cover}
          width={32}
          height={48}
          cutout
          cutoutSize={2}
          svgUrl={book.svgUrl}
          accessibilityLabel={book.title}
        />
        <View style={styles.text}>
          <Text role="ui" size={14} numberOfLines={1}>
            {book.title}
          </Text>
          <Text role="caption" size={12} color="ink2" numberOfLines={1}>
            {t(`voice.mode.${sessionRecord.mode}` as const)}
          </Text>
        </View>
        <Text role="mono" color="ink2">
          {t(`voice.state.${voiceState}` as const)}
        </Text>
      </Pressable>
      <IconButton
        icon={<MuteGlyph size={18} />}
        accessibilityLabel={t('voice.mute')}
        onPress={() => setMuted(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minWidth: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
});
