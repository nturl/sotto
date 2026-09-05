/**
 * SelectableSpeechText — reader-only fork of ../SpeechFillText.tsx adding
 * span selection (O2-C task C1): click-drag on web, long-press-drag on
 * touch, extending a selection across words within the block being
 * rendered. A plain tap/click still calls `onTap` unchanged (today's
 * single-word behaviour).
 *
 * This is a fork rather than an edit to SpeechFillText.tsx because that
 * component is also used by the voice screen (Lane B territory) — kept
 * separate so this lane's reader-only change can't collide with it.
 * Visual language (speech fill animation, marker stroke, dotted
 * underline) mirrors it exactly; DESIGN.md reader spec additionally calls
 * for an 18% peach fill with radius 2 across every token in a drag span.
 *
 * Drag hit-testing works by giving every word a `data-token-id` (RN Web
 * forwards `dataSet` straight to a DOM `data-*` attribute) and, once a
 * pointer-down arms a drag (immediately for a mouse button-down, after a
 * long-press hold for touch), resolving `document.elementFromPoint(x, y)`
 * on every subsequent pointer move — the standard way to do drag-select
 * across sibling DOM nodes when the browser captures the pointer to its
 * start element (which is what happens for touch, unlike mouse hover).
 * This only works on web (RN Web renders real DOM); on native RN there is
 * no DOM to query, so on native this component behaves exactly like plain
 * SpeechFillText (tap and long-press-sentence only, no drag) — a knowing,
 * disclosed gap, not a silent one: native drag-select would need
 * PanResponder plus per-token layout measurement, out of scope for this
 * dispatch's verified (web) surface.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text as RNText, type TextStyle } from 'react-native';
import { motion, radius, type schemes } from '@sotto/core/theme';
// ThemedText (not the plain Text component) so the paragraph wrapper's
// base color follows the active scheme too — see
// ui/theme/ThemedText.tsx's doc comment.
import { ThemedText as Text, useTheme } from '../theme';
import { withAlpha } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import type { SpeechSentence, SpeechToken } from '../SpeechFillText';

const LONG_PRESS_MS = 350;

type ThemeColors = Record<keyof (typeof schemes)['light'], string>;

export type SelectableSpeechTextProps = {
  sentences: SpeechSentence[];
  /** Every token id that should render the peach selection fill (a single
   * tapped word, or every token in a committed span). */
  selectedSpanTokenIds?: ReadonlySet<string>;
  style?: TextStyle;
  cjk?: boolean;
  underline?: boolean;
  onTap?: (token: SpeechToken, sentence: SpeechSentence) => void;
  /** Fires once, on drag release, with the drag's start/end token ids (in
   * whichever order the drag happened — the caller normalizes). */
  onSpanSelect?: (anchorTokenId: string, focusTokenId: string) => void;
  onLongPressSentence?: (sentence: SpeechSentence) => void;
};

function SpeechWord({
  tokenId,
  text,
  spoken,
  selected,
  previewSelected,
  saved,
  underline,
  reduced,
  isWord,
  colors,
  peachSelection,
  peachUnderline,
  onPress,
  onPointerDown,
  onPointerEnter,
}: {
  tokenId: string;
  text: string;
  spoken: boolean;
  selected: boolean;
  previewSelected: boolean;
  saved: boolean;
  underline: boolean;
  reduced: boolean;
  isWord: boolean;
  /** Active scheme's palette (DESIGN.md dark-mode task) — read via
   * useTheme() in the parent and passed down so this leaf, called per
   * token, doesn't each subscribe to the theme context separately. */
  colors: ThemeColors;
  peachSelection: string;
  peachUnderline: string;
  onPress?: () => void;
  onPointerDown?: (e: { pointerType?: string; clientX: number; clientY: number }) => void;
  onPointerEnter?: () => void;
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
  const filled = selected || previewSelected;

  return (
    <Animated.Text
      onPress={onPress}
      // @ts-expect-error -- web-only pointer prop; RN Web forwards it, native ignores unknown props.
      onPointerDown={isWord ? onPointerDown : undefined}
      onPointerEnter={isWord ? onPointerEnter : undefined}
      dataSet={isWord ? { tokenId } : undefined}
      selectable={false}
      style={[
        {
          color,
          backgroundColor: filled ? peachSelection : saved ? colors.mark : 'transparent',
          borderRadius: radius.sm,
        },
        saved ? { transform: [{ skewX: '-10deg' }] } : null,
        underline
          ? {
              borderBottomWidth: 1,
              borderBottomColor: peachUnderline,
              borderStyle: 'dotted' as const,
            }
          : null,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

export function SelectableSpeechText({
  sentences,
  selectedSpanTokenIds,
  style,
  cjk = false,
  underline = false,
  onTap,
  onSpanSelect,
  onLongPressSentence,
}: SelectableSpeechTextProps) {
  const reduced = useReducedMotion();
  const isWeb = Platform.OS === 'web';
  const { colors } = useTheme();
  const peachSelectionActive = useMemo(() => withAlpha(colors.peach, 0.18), [colors.peach]);
  const peachUnderlineActive = useMemo(() => withAlpha(colors.peach, 0.35), [colors.peach]);

  // Flat reading-order id list for this block, used only to compute the
  // *preview* highlight while dragging (the parent recomputes the
  // authoritative span against real domain Sentence/Token objects once
  // the drag ends).
  const flatIds = useMemo(() => sentences.flatMap((s) => s.tokens.map((t) => t.id)), [sentences]);
  const idSet = useMemo(() => new Set(flatIds), [flatIds]);

  const [previewSpan, setPreviewSpan] = useState<Set<string> | null>(null);
  const anchorRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewFromTo = (fromId: string, toId: string): Set<string> => {
    const a = flatIds.indexOf(fromId);
    const b = flatIds.indexOf(toId);
    if (a === -1 || b === -1) return new Set([fromId]);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return new Set(flatIds.slice(lo, hi + 1));
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const endDrag = () => {
    const anchor = anchorRef.current;
    draggingRef.current = false;
    anchorRef.current = null;
    clearLongPressTimer();
    const finalSpan = previewSpan;
    setPreviewSpan(null);
    if (anchor && finalSpan && finalSpan.size > 1 && onSpanSelect) {
      // Recover the far end of the span (order doesn't matter to the caller).
      const ids = [...finalSpan];
      const focus = ids[0] === anchor ? (ids.at(-1) ?? anchor) : (ids[0] ?? anchor);
      onSpanSelect(anchor, focus);
    }
  };

  useEffect(() => {
    if (!isWeb) return undefined;
    const handleMove = (e: PointerEvent) => {
      if (!draggingRef.current || !anchorRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tokenId = el?.dataset?.tokenId;
      if (tokenId && idSet.has(tokenId)) {
        setPreviewSpan(previewFromTo(anchorRef.current, tokenId));
      }
    };
    const handleUp = () => {
      if (draggingRef.current) endDrag();
      clearLongPressTimer();
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeb, idSet, previewSpan]);

  const handlePointerDown = (
    tokenId: string,
    e: { pointerType?: string; clientX: number; clientY: number },
  ) => {
    if (!isWeb) return;
    anchorRef.current = tokenId;
    setPreviewSpan(new Set([tokenId]));
    if (e.pointerType === 'touch') {
      // Long-press-drag on touch: arm dragging only after a hold, so a
      // normal scroll gesture isn't hijacked as a selection.
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        draggingRef.current = true;
      }, LONG_PRESS_MS);
    } else {
      // Mouse: click-drag arms immediately.
      draggingRef.current = true;
    }
  };

  const handlePointerEnter = (tokenId: string) => {
    if (!isWeb || !draggingRef.current || !anchorRef.current) return;
    setPreviewSpan(previewFromTo(anchorRef.current, tokenId));
  };

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
                  tokenId={token.id}
                  text={token.text}
                  spoken={token.spoken}
                  selected={!!selectedSpanTokenIds?.has(token.id)}
                  previewSelected={!!previewSpan?.has(token.id)}
                  saved={!!token.saved}
                  underline={underline && !!token.isWord && !token.saved}
                  reduced={reduced}
                  isWord={!!token.isWord}
                  colors={colors}
                  peachSelection={peachSelectionActive}
                  peachUnderline={peachUnderlineActive}
                  onPress={onTap && token.isWord ? () => onTap(token, sentence) : undefined}
                  onPointerDown={token.isWord ? (e) => handlePointerDown(token.id, e) : undefined}
                  onPointerEnter={token.isWord ? () => handlePointerEnter(token.id) : undefined}
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
