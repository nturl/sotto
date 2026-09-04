import { PlaceholderScreen } from '../../src/ui/PlaceholderScreen';
import { useT } from '../../src/i18n/useT';

export default function Library() {
  const t = useT();
  return <PlaceholderScreen title={t('tabs.library')} />;
}
