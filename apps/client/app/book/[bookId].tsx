import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../src/ui/PlaceholderScreen';

export default function BookDetail() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  return <PlaceholderScreen title={`Book — ${bookId}`} />;
}
