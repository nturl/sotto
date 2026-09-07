/**
 * The in-browser tutor's three-state panel (planning/BROWSER-TUTOR.md):
 *
 *   unsupported     no WebGPU — the clear "unavailable" message the voice
 *                   screen has always shown, now naming the actual reason.
 *   needs-download  WebGPU, no models: every model listed by name and size,
 *                   a primary cutout CTA, and per-model progress once it
 *                   starts. Never automatic — a download only ever begins
 *                   on this tap.
 *   ready           models are cached; "Remove models" frees them again.
 *
 * Shared by the voice screen and Settings > Tutor models so the two can
 * never disagree about what is installed.
 *
 * `ownProviderStatus` (run 7, lane E, src/voice/ownProviderStatus.ts) is an
 * optional, separate fact: whether own-provider mode is connected does not
 * change what this panel reports about the browser models themselves — it
 * only adds one extra line so "Browser models: not installed" is never read
 * as "the tutor itself is unavailable" when a connected key already covers
 * it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  downloadTutorModels,
  modelsForTier,
  removeModels,
  resolveTier,
  totalSizeMb,
  TUTOR_TIERS,
  type ModelProgress,
  type TutorModelSpec,
  type TutorTier,
} from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { Button } from '../ui/Button';
import { setPreference, usePreferences } from '../ui/data';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { webCursor } from '../ui/tokens';
import { deviceSupportsLargeTier } from './availability';
import type { OwnProviderStatus } from './ownProviderStatus';

export type TutorModelsPanelState =
  | { kind: 'unsupported' }
  | { kind: 'needs-download'; models: TutorModelSpec[] }
  | { kind: 'ready' };

/**
 * The learner's "Tutor size" (preferences.tutorModelTier, packages/voice
 * `TUTOR_TIERS`). Read it here rather than passing it down: every screen
 * that renders this panel already reads the store, and the two would
 * otherwise be able to disagree about which models the panel is describing.
 */
export function useTutorTier(): TutorTier {
  return resolveTier(usePreferences().tutorModelTier);
}

const TIERS: TutorTier[] = ['standard', 'large'];

/**
 * Two rows — Standard and Large — each with its measured total download and
 * a one-line description. The Large row is disabled, with the reason shown,
 * on a device `deviceSupportsLargeTier()` rules out (availability.ts): under
 * 8 GB of reported memory, or a WebGPU adapter whose buffer limits are too
 * small to hold a 4B model.
 *
 * Row visuals follow Settings > Appearance's picker (surface card, hairline
 * dividers, accent left bar on the selection) so this reads as the same
 * control the rest of Settings uses.
 *
 * Changing the size does NOT delete the other size's cached weights — the
 * libraries keep both — which the note under the rows says outright.
 */
export function TutorSizePicker({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const selected = useTutorTier();
  const [largeOk, setLargeOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void deviceSupportsLargeTier().then((ok) => {
      if (!cancelled) setLargeOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.picker}>
      <Text role="ui" size={14}>
        {t('tutor.size.title')}
      </Text>
      <View style={[styles.card, { borderColor: colors.hairline }]}>
        {TIERS.map((tier, index) => {
          const isSelected = selected === tier;
          // `null` is "still probing": leave the row enabled rather than
          // flashing a disabled state that resolves a frame later.
          const disabled = tier === 'large' && largeOk === false;
          const total = totalSizeMb(modelsForTier(tier));
          return (
            <Pressable
              key={tier}
              onPress={() => {
                if (disabled || isSelected) return;
                setPreference('tutorModelTier', tier);
                onChanged?.();
              }}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled }}
              style={[
                styles.tierRow,
                index < TIERS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.hairline,
                },
                isSelected && {
                  borderLeftWidth: 3,
                  borderLeftColor: colors.accent,
                  paddingLeft: 11,
                },
                disabled && styles.tierRowDisabled,
                webCursor,
              ]}
            >
              <View style={styles.rowHead}>
                <Text role="ui" size={15}>
                  {t(`tutor.size.${tier}` as const)}
                </Text>
                <Text role="caption" color="ink3">
                  {t('tutor.browser.sizeMb', { size: total })}
                </Text>
              </View>
              <Text role="caption" color="ink3">
                {disabled
                  ? t('tutor.size.needsCapableDevice')
                  : t(`tutor.size.${tier}Hint` as const)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text role="caption" color="ink3">
        {t('tutor.size.keepsBoth')}
      </Text>
    </View>
  );
}

function ProgressBar({
  fraction,
  styles,
}: {
  fraction: number | null;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          fraction === null
            ? styles.fillIndeterminate
            : { width: `${Math.round(fraction * 100)}%` },
        ]}
      />
    </View>
  );
}

export function TutorModelsPanel({
  state,
  onChanged,
  showRemove = true,
  ownProviderStatus,
}: {
  state: TutorModelsPanelState;
  /** Called after models are installed or removed, so the gate re-runs. */
  onChanged: () => void;
  showRemove?: boolean;
  /** Optional: when own-provider mode is connected/active, an extra line
   * makes clear the browser-model line isn't the whole readiness story. */
  ownProviderStatus?: OwnProviderStatus;
}) {
  const t = useT();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const tier = useTutorTier();
  const mounted = useRef(true);
  const ownProviderConnected = ownProviderStatus === 'connected' || ownProviderStatus === 'active';
  const ownProviderNote = ownProviderConnected ? (
    <Text role="caption" color="ink2" style={styles.centered}>
      {t('tutor.browser.ownProviderNote')}
    </Text>
  ) : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(() => {
    setFailure(null);
    setBusy(true);
    setProgress({});
    const handle = downloadTutorModels({
      tier,
      onProgress: (p) => {
        if (mounted.current) setProgress((prev) => ({ ...prev, [p.modelId]: p }));
      },
    });
    handle.done
      .then(() => {
        if (!mounted.current) return;
        setBusy(false);
        onChanged();
      })
      .catch((err: unknown) => {
        if (!mounted.current) return;
        setBusy(false);
        setFailure(err instanceof Error ? err.message : String(err));
      });
  }, [onChanged, tier]);

  const remove = useCallback(() => {
    void removeModels().then(() => {
      setProgress({});
      onChanged();
    });
  }, [onChanged]);

  if (state.kind === 'unsupported') {
    return (
      <View style={styles.panel}>
        <Text role="caption" color="warn" style={styles.centered}>
          {t('tutor.browser.unsupported')}
        </Text>
        <Text role="caption" color="ink3" style={styles.centered}>
          {t('tutor.browser.unsupportedHint')}
        </Text>
        {ownProviderNote}
      </View>
    );
  }

  if (state.kind === 'ready') {
    return (
      <View style={styles.panel}>
        <Text role="caption" color="ink2" style={styles.centered}>
          {t('tutor.browser.ready')}
        </Text>
        <Text role="caption" color="ink3" style={styles.centered}>
          {t('tutor.browser.sliceNote')}
        </Text>
        <TutorSizePicker onChanged={onChanged} />
        {showRemove ? (
          <Button title={t('tutor.browser.remove')} variant="secondary" onPress={remove} />
        ) : null}
        {ownProviderNote}
      </View>
    );
  }

  const total = totalSizeMb(state.models);
  return (
    <View style={styles.panel}>
      <Text role="heading" size={16} style={styles.centered}>
        {t('tutor.browser.title')}
      </Text>
      <Text role="caption" color="ink2" style={styles.centered}>
        {t('tutor.browser.needsDownload', { size: total })}
      </Text>

      <TutorSizePicker onChanged={onChanged} />

      <View style={styles.list}>
        {state.models.map((m) => {
          const p = progress[m.id];
          return (
            <View key={m.id} style={styles.row}>
              <View style={styles.rowHead}>
                <Text role="ui" size={14}>
                  {m.name}
                </Text>
                <Text role="caption" color="ink3">
                  {t('tutor.browser.sizeMb', { size: m.sizeMb })}
                </Text>
              </View>
              {p ? <ProgressBar fraction={p.fraction} styles={styles} /> : null}
            </View>
          );
        })}
      </View>

      <Text role="caption" color="ink3" style={styles.centered}>
        {t('tutor.browser.privacy')}
      </Text>

      {failure ? (
        <>
          <Text role="caption" color="warn" style={styles.centered}>
            {t('tutor.browser.failed')}
          </Text>
          {/* The library's own error, untranslated on purpose: it names the
              file or device that failed, which is the only thing that makes
              a download failure diagnosable from a bug report. */}
          <Text role="mono" size={11} color="ink3" style={styles.centered}>
            {failure}
          </Text>
        </>
      ) : null}

      <Button
        title={busy ? t('tutor.browser.downloading') : t('tutor.browser.download')}
        onPress={start}
        disabled={busy}
      />
      {ownProviderNote}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    panel: {
      gap: space.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: space.lg,
      marginBottom: space.lg,
    },
    centered: {
      textAlign: 'center',
    },
    list: {
      gap: space.sm,
    },
    picker: {
      gap: space.sm,
    },
    card: {
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    tierRow: {
      paddingVertical: space.md,
      paddingHorizontal: 14,
      minHeight: space.tapTarget,
      justifyContent: 'center',
      gap: space.xs,
    },
    tierRowDisabled: {
      opacity: 0.5,
    },
    row: {
      gap: space.xs,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surface2,
      overflow: 'hidden',
    },
    fill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    fillIndeterminate: {
      width: '15%',
    },
  });
}
