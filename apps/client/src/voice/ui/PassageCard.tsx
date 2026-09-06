/**
 * PassageCard — F2 (run7/cards/F2-voice-screen.md directive 2): the top of
 * the redesigned voice screen. Title + "Change passage" (back to the
 * reader) sit above the same speech-fill passage window the screen has
 * always shown; moving it into a bordered card is what turns "a caption
 * strip at the bottom" into a passage the learner can see is the subject
 * of the conversation happening below it.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../../i18n/useT';
import { SpeechFillText, type SpeechSentence } from '../../ui/SpeechFillText';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { webCursor } from '../../ui/tokens';

export interface PassageCardProps {
  title: string;
  sentences: SpeechSentence[];
  hasPassage: boolean;
  isLoading: boolean;
  selectedId?: string;
  cjk: boolean;
  onChangePassage: () => void;
}

export function PassageCard({
  title,
  sentences,
  hasPassage,
  isLoading,
  selectedId,
  cjk,
  onChangePassage,
}: PassageCardProps) {
  const t = useT();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text role="heading" size={16} numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text
          role="ui"
          size={13}
          color="accent"
          onPress={onChangePassage}
          style={webCursor}
          accessibilityRole="link"
        >
          {t('voice.changePassage')}
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!isLoading && hasPassage ? (
          <SpeechFillText sentences={sentences} selectedId={selectedId} cjk={cjk} />
        ) : (
          <Text role="caption" color="ink3">
            {t('voice.loading')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.md,
      maxHeight: 180,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.xs,
      gap: space.sm,
    },
    title: {
      flex: 1,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingBottom: space.xs,
    },
  });
}
