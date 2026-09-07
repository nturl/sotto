/**
 * Settings > Tutor models — the same three-state panel the voice screen
 * shows, reachable without opening a book, plus "Remove models".
 * See planning/BROWSER-TUTOR.md.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { modelsForTier, totalSizeMb } from '@sotto/voice';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { browserAvailability } from '../../src/voice/availability';
import { useOwnProviderStatus } from '../../src/voice/ownProviderStatus';
import {
  TutorModelsPanel,
  useTutorTier,
  type TutorModelsPanelState,
} from '../../src/voice/TutorModelsPanel';

function toPanelState(
  availability: Awaited<ReturnType<typeof browserAvailability>>,
): TutorModelsPanelState | null {
  if (availability.status === 'unavailable') return { kind: 'unsupported' };
  if (availability.status === 'needs-download')
    return { kind: 'needs-download', models: availability.models };
  if (availability.status === 'ready') return { kind: 'ready' };
  return null;
}

export default function TutorModelsScreen() {
  const t = useT();
  const [state, setState] = useState<TutorModelsPanelState | null>(null);
  const ownProviderStatus = useOwnProviderStatus();
  // The picker inside the panel writes this preference; re-running the gate
  // against the newly chosen tier is what makes the download list below it
  // switch to that tier's models.
  const tier = useTutorTier();

  const recheck = useCallback(() => {
    void browserAvailability(modelsForTier(tier)).then((a) => setState(toPanelState(a)));
  }, [tier]);

  useEffect(recheck, [recheck]);

  return (
    <Shell>
      <BackLink />
      <View style={styles.body}>
        <SectionEyebrow>{t('tutor.browser.settingsRow')}</SectionEyebrow>
        {state ? (
          <TutorModelsPanel
            state={state}
            onChanged={recheck}
            ownProviderStatus={ownProviderStatus}
          />
        ) : null}
        <Text role="caption" color="ink3">
          {t('tutor.browser.eventualTotal', { size: totalSizeMb(modelsForTier(tier)) })}
        </Text>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
});
