/**
 * Settings > Tutor models — the same three-state panel the voice screen
 * shows, reachable without opening a book, plus "Remove models".
 * See planning/BROWSER-TUTOR.md.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ALL_TUTOR_MODELS, totalSizeMb } from '@sotto/voice';
import { space } from '@sotto/core/theme';
import { useT } from '../../src/i18n/useT';
import { BackLink } from '../../src/ui/BackLink';
import { SectionEyebrow } from '../../src/ui/SectionEyebrow';
import { Shell } from '../../src/ui/Shell';
import { Text } from '../../src/ui/Text';
import { browserAvailability } from '../../src/voice/availability';
import { TutorModelsPanel, type TutorModelsPanelState } from '../../src/voice/TutorModelsPanel';

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

  const recheck = useCallback(() => {
    void browserAvailability().then((a) => setState(toPanelState(a)));
  }, []);

  useEffect(recheck, [recheck]);

  return (
    <Shell>
      <BackLink />
      <View style={styles.body}>
        <SectionEyebrow>{t('tutor.browser.settingsRow')}</SectionEyebrow>
        {state ? <TutorModelsPanel state={state} onChanged={recheck} /> : null}
        <Text role="caption" color="ink3">
          {t('tutor.browser.eventualTotal', { size: totalSizeMb(ALL_TUTOR_MODELS) })}
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
