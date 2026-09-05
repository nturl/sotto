/**
 * app.config.ts — replaces app.json (R3-S). Same values as the prior
 * app.json, plus the store-facing additions CONTRACTS.md's "never add
 * auth/payments/analytics as a default" doesn't touch (they only ever
 * render behind a real CloudAdapter — see apps/client/src/cloud/): iOS
 * purpose strings for the account/paywall screens' native deps, a privacy
 * manifest, and the three new plugins.
 *
 * `ios.privacyManifests` is a real, documented ExpoConfig field (not a
 * plugin option): `@expo/prebuild-config`'s default iOS plugin chain
 * (`withDefaultPlugins.js`) calls `withPrivacyInfo(config)` automatically
 * during `expo prebuild`, which writes it out as `PrivacyInfo.xcprivacy` —
 * so no plugin entry or hand-written xcprivacy file under
 * apps/client/ios-privacy/ is needed for this. `expo-build-properties` was
 * evaluated (per the task brief) and NOT added: its only relevant knob is
 * `ios.privacyManifestAggregationEnabled`, which is already the default
 * (true) — nothing here needs overriding, so it would be an unused
 * dependency.
 */
import type { ExpoConfig } from 'expo/config';

const BUNDLE_ID = 'xyz.noelturlington.sotto';

// `newArchEnabled` is a real, accepted app.json/app.config field (verified
// via `npx expo config`, which echoes it back correctly) that this SDK
// version's `@expo/config-types` package hasn't added to `ExpoConfig` yet —
// widen the type rather than drop the field, which was already set in the
// prior app.json.
const config: ExpoConfig & { newArchEnabled?: boolean } = {
  name: 'Sotto',
  slug: 'sotto',
  scheme: 'sotto',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-audio',
    '@siteed/audio-studio',
    // R3-S additions — see the task's per-file justifications in the
    // report: expo-apple-authentication (native "Sign in with Apple"
    // button, app/account/index.tsx), expo-secure-store (native session
    // token storage, src/cloud/http.ts), expo-iap (StoreKit purchases,
    // src/cloud/iap.ts).
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-iap',
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    // No universal-links domain is registered yet (docs/app-store.md —
    // no Apple Developer team configured). The magic-link/Apple deep link
    // uses the custom `sotto://` scheme instead (already declared via
    // `scheme` above), which needs no associated domain.
    associatedDomains: [],
    infoPlist: {
      NSMicrophoneUsageDescription: 'Sotto uses the microphone for the optional voice tutor.',
      // Deliberately no NSSpeechRecognitionUsageDescription: Sotto never
      // calls Apple's on-device SFSpeechRecognizer. Speech-to-text runs
      // through the local/cloud Whisper cascade instead (CONTRACTS.md §5),
      // which is a plain network/local HTTP call, not a purpose-string API.
    },
    // Apple's "required reason" API categories this app's dependency tree
    // actually touches: NSUserDefaults, reason CA92.1 ("access info from
    // the same app, per the documented API, to store data") — covers
    // zustand's own module state and any dependency reading/writing
    // UserDefaults directly (SecureStore/AsyncStorage-style caches use
    // Keychain/SQLite, not UserDefaults, so they aren't listed here).
    // Re-verify with `npx expo prebuild` + Apple's own privacy-report
    // tooling once real IAP/Apple-auth products exist and this actually
    // ships to TestFlight — see docs/app-store.md.
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
    },
  },
  android: {
    package: BUNDLE_ID,
    permissions: ['RECORD_AUDIO'],
    adaptiveIcon: {
      backgroundColor: '#F4ECDF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    output: 'single',
  },
  extra: {
    eas: {
      // Filled in once `eas init` runs against a real Expo account
      // (docs/app-store.md — no Apple/Expo team configured this session).
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
};

export default config;
