/**
 * SpeechFillText — DESIGN.md "Reader" + "Voice screen", devices B & C. The
 * shared flowing-paragraph renderer for both screens: a paragraph (or
 * passage) is ONE outer <Text>, sentences and word tokens are nested <Text>
 * children so they stay inline (a set paperback, not one sentence per
 * line) — RN supports onPress/onLongPress on nested Text on web and native.
 *
 * Device C (speech fill): during narration each word transitions
 * quiet -> ink as the narrator reaches it (60ms per word); the current
 * sentence gets no box. A tap-selected word carries an 18% peach fill,
 * radius 2.
 * Device B (marker stroke, reader only): a saved word normally gets a
 * skewed #FFD8A8 rectangle drawn under it via a position:absolute View
 * (see MarkerStroke.tsx) — that breaks inline flow, so inline tokens here
 * carry the mark as a background-colour + skewed transform on the nested
 * Text itself instead, staying inline.
 */
import { Fragment, useEffect, useRef } from 'react';
import { Animated, Easing, Text as RNText, type TextStyle } from 'react-native';
import { colors, motion, radius } from '@sotto/core/theme';
import { Text } from './Text';
import { peachSelection, peachUnderline } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export type SpeechToken = {
  id: string;
  text: string;
  /** Whitespace preceded this token in the source sentence (default true).
   * WS-4 addition so latin-script punctuation/clitics render without a
   * spurious space; `cjk` skips inter-token spacing entirely regardless. */
  spaceBefore?: boolean;
  /** Only word tokens are pressable/selectable (punctuation is not). */
  isWord?: boolean;
  /** Already spoken by the narrator/tutor (renders ink); false = quiet. */
  spoken: boolean;
  /** Reader only: carries the saved-word marker. */
  saved?: boolean;
};

export type SpeechSentence = {
  id: string;
  tokens: SpeechToken[];
};

export type SpeechFillTextProps = {
  sentences: SpeechSentence[];
  selectedId?: string;
  style?: TextStyle;
  /** Chinese/CJK text: tokens (and sentences) join with no space at all
   * (WS-4 addition). */
  cjk?: boolean;
  /** Reader only: dotted peach underline under word tokens. */
  underline?: boolean;
  onPressToken?: (token: SpeechToken, sentence: SpeechSentence) => void;
  onLongPressSentence?: (sentence: SpeechSentence) => void;
};

function SpeechWord({
  text,
  spoken,
  selected,
  saved,
  underline,
  reduced,
  onPress,
}: {
  text: string;
  spoken: boolean;
  selected: boolean;
  saved: boolean;
  underline: boolean;
  reduced: boolean;
  onPress?: () => void;
}) {
  const fill = useRef(new Animated.Value(spoken ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      fill.setValue(spoken ? 1 : 0);
      return;
    }
    Animated.timing(fill, {
      toValue: spoken ? 1 : 0,
      duration: motion.speechFillStaggerMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [spoken, reduced, fill]);

  const color = fill.interpolate({ inputRange: [0, 1], outputRange: [colors.quiet, colors.ink] });

  return (
    <Animated.Text
      onPress={onPress}
      selectable={false}
      style={[
        {
          color,
          backgroundColor: selected ? peachSelection : saved ? colors.mark : 'transparent',
          borderRadius: radius.sm,
        },
        saved ? { transform: [{ skewX: '-10deg' }] } : null,
        underline ? styleUnderline : null,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

export function SpeechFillText({
  sentences,
  selectedId,
  style,
  cjk = false,
  underline = false,
  onPressToken,
  onLongPressSentence,
}: SpeechFillTextProps) {
  const reduced = useReducedMotion();
  return (
    <Text role="reading" selectable={false} style={[cjk ? readingCjkStyle : undefined, style]}>
      {sentences.map((sentence, sentenceIndex) => (
        <Fragment key={sentence.id}>
          {!cjk && sentenceIndex > 0 ? <RNText> </RNText> : null}
          <RNText
            onLongPress={onLongPressSentence ? () => onLongPressSentence(sentence) : undefined}
          >
            {sentence.tokens.map((token, i) => (
              <Fragment key={token.id}>
                {!cjk && i > 0 && token.spaceBefore !== false ? <RNText> </RNText> : null}
                <SpeechWord
                  text={token.text}
                  spoken={token.spoken}
                  selected={token.id === selectedId}
                  saved={!!token.saved}
                  underline={underline && !!token.isWord && !token.saved}
                  reduced={reduced}
                  onPress={
                    onPressToken && token.isWord ? () => onPressToken(token, sentence) : undefined
                  }
                />
              </Fragment>
            ))}
          </RNText>
        </Fragment>
      ))}
    </Text>
  );
}

const readingCjkStyle: TextStyle = {
  fontSize: 22,
  lineHeight: Math.round(22 * 1.8),
};

const styleUnderline: TextStyle = {
  borderBottomWidth: 1,
  borderBottomColor: peachUnderline,
  borderStyle: 'dotted',
};
