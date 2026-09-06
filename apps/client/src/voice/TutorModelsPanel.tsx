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
import { StyleSheet, View } from 'react-native';
import {
  downloadTutorModels,
  removeModels,
  totalSizeMb,
  type ModelProgress,
  type TutorModelSpec,
} from '@sotto/voice';
import { radius, space } from '@sotto/core/theme';
import { useT } from '../i18n/useT';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import type { OwnProviderStatus } from './ownProviderStatus';

export type TutorModelsPanelState =
  | { kind: 'unsupported' }
  | { kind: 'needs-download'; models: TutorModelSpec[] }
  | { kind: 'ready' };

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
  }, [onChanged]);

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
