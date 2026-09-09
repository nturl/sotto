import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import type { Chapter } from '@sotto/core';
import { radius, space } from '@sotto/core/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { useSottoStore } from '../../state/store';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { buildTranscriptSavedWord, type TranscriptWordSegment } from '../transcriptVocabulary';

export interface TutorWordSheetProps {
  selection: TranscriptWordSegment;
  chapter: Chapter;
  bookId: string;
  sourceLocale: string;
  explanationLocale: string;
  onClose: () => void;
}

/** Mounted with a selection key so a new tap never inherits an edited meaning. */
export function TutorWordSheet({
  selection,
  chapter,
  bookId,
  sourceLocale,
  explanationLocale,
  onClose,
}: TutorWordSheetProps) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const savedWords = useSottoStore((s) => s.savedWords);
  const saveWord = useSottoStore((s) => s.saveWord);
  const params = {
    selection,
    chapter,
    bookId,
    chapterId: chapter.id,
    sourceLocale,
    explanationLocale,
  };
  const [initial] = useState(() => buildTranscriptSavedWord(params));
  const tokenId = initial.kind === 'ready' ? initial.word.tokenId : initial.tokenId;
  const saved = savedWords.find((w) => w.bookId === bookId && w.tokenId === tokenId);
  const [meaning, setMeaning] = useState(
    saved?.translation ?? (initial.kind === 'ready' ? initial.word.translation : ''),
  );
  const styles = createStyles(colors);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const save = () => {
    if (saved || !meaning.trim()) return;
    const result = buildTranscriptSavedWord({ ...params, meaning: meaning.trim() });
    if (result.kind === 'ready') saveWord(result.word);
  };

  return (
    <Sheet
      visible
      style={styles.sheet}
      onDismiss={onClose}
      dismissAccessibilityLabel={t('common.close')}
      footer={
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          {saved ? (
            <Text accessibilityLiveRegion="polite" role="caption" color="ink2">
              {t('reader.savedToast')}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              title={t('common.close')}
              variant="secondary"
              onPress={onClose}
              style={styles.action}
            />
            <Button
              title={saved ? t('reader.saved') : t('reader.save')}
              disabled={!!saved || !meaning.trim()}
              onPress={save}
              style={styles.action}
            />
          </View>
        </View>
      }
    >
      <View style={styles.content}>
        <Text role="heading" size={24}>
          {selection.text}
        </Text>
        <Text role="caption" color="ink2">
          {selection.contextSentence}
        </Text>
        <Text role="caption">{t('voice.vocabulary.meaning')}</Text>
        <TextInput
          value={saved?.translation ?? meaning}
          onChangeText={setMeaning}
          editable={!saved}
          accessibilityLabel={t('voice.vocabulary.meaning')}
          placeholder={t('voice.vocabulary.meaningHint')}
          placeholderTextColor={colors.ink3}
          style={styles.input}
          onSubmitEditing={save}
          returnKeyType="done"
        />
      </View>
    </Sheet>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    sheet: { maxHeight: '80%', zIndex: 20 },
    content: { gap: space.sm, width: '100%', maxWidth: 560, alignSelf: 'center' },
    footer: {
      gap: space.sm,
      paddingHorizontal: space.gutter.phone,
      width: '100%',
      maxWidth: 600,
      alignSelf: 'center',
    },
    actions: { flexDirection: 'row', gap: space.md },
    action: { flex: 1 },
    input: {
      minHeight: space.tapTarget,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
      color: colors.ink,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: 16,
    },
  });
}
