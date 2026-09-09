import { Platform } from 'react-native';

// React Native Web waits 50ms before onPressIn by default. These controls
// should acknowledge a touch immediately; onPress still commits on release.
export const webPressFeedback = Platform.OS === 'web' ? { delayPressIn: 0, delayPressOut: 0 } : {};
