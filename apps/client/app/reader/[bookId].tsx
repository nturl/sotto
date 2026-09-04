import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../src/ui/PlaceholderScreen';

export default function Reader() {
  const { bookId } = useLocalSearchParams<{ bookId: string; mode?: string }>();
  return <PlaceholderScreen title={`Reader — ${bookId}`} />;
}
