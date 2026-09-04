import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../src/ui/PlaceholderScreen';

export default function VoiceSession() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  return <PlaceholderScreen title={`Voice — ${bookId}`} />;
}
