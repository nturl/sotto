/**
 * SpeechFillText — DESIGN.md device C. During narration each word
 * transitions quiet -> ink as the narrator reaches it (60ms per word); the
 * current sentence gets no box. A tap-selected word carries an 18% peach
 * fill, radius 2. Never a highlight box chasing the narration.
 */
import { Fragment, useEffect, useRef } from 'react';
import { Animated, Easing, Text as RNText, type TextStyle } from 'react-native';
import { colors, motion, radius } from '@sotto/core/theme';
import { Text } from './Text';
import { peachSelection } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export type SpeechToken = { id: string; text: string };

export type SpeechFillTextProps = {
  tokens: SpeechToken[];
  /** Every token with index <= currentIndex has been spoken (ink). */
  currentIndex: number;
  selectedId?: string;
  style?: TextStyle;
};

function SpeechWord({ text, spoken, selected, reduced }: { text: string; spoken: boolean; selected: boolean; reduced: boolean }) {
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
      style={{
        color,
        backgroundColor: selected ? peachSelection : 'transparent',
        borderRadius: radius.sm,
      }}
    >
      {text}
    </Animated.Text>
  );
}

export function SpeechFillText({ tokens, currentIndex, selectedId, style }: SpeechFillTextProps) {
  const reduced = useReducedMotion();
  return (
    <Text role="reading" style={style}>
      {tokens.map((token, index) => (
        <Fragment key={token.id}>
          <SpeechWord
            text={token.text}
            spoken={index <= currentIndex}
            selected={token.id === selectedId}
            reduced={reduced}
          />
          {index < tokens.length - 1 ? <RNText> </RNText> : null}
        </Fragment>
      ))}
    </Text>
  );
}
