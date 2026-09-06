/**
 * Onboarding's four questions, as data (run 7 lane C).
 *
 * The kickoff asks for "four separate questions, changing one never changes
 * another" — an invariant, not a layout note, so it lives here where a test
 * can hold it rather than inside a screen's `useState` calls. The screen
 * (`app/onboarding/index.tsx`) renders one step at a time from this; the
 * proposal a learner starts from is the old fast path's
 * (`fastPathDefaults.ts`), so they confirm rather than start from nothing.
 */
import type { BookLevel } from '../ui/dev/fixtures';
import type { FastPathDefaults } from './fastPathDefaults';

/** The order the questions are asked in. Interface language first, because
 * every later step renders in it. */
export const ONBOARDING_STEPS = [
  'interfaceLocale',
  'learningLocale',
  'level',
  'explanationLocale',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface WizardState {
  interfaceLocale: string;
  /** The row picked in the language list; `zh` is one row with the script
   * chosen separately, so this is not always the stored preference. */
  learningLocale: string;
  explanationLocale: string;
  level: BookLevel;
  script: string;
}

export type WizardField = keyof WizardState;

export function initialWizardState(defaults: FastPathDefaults): WizardState {
  return {
    interfaceLocale: defaults.interfaceLocale,
    learningLocale: defaults.learningLocale,
    explanationLocale: defaults.explanationLocale,
    level: defaults.level,
    script: 'zh-CN',
  };
}

/**
 * Sets exactly one answer. Written as a whole-state function with no
 * cross-field effects on purpose: the "changing the learning language
 * silently changed the interface language" class of bug can only come back
 * by editing this one line, and the test next door watches it.
 */
export function setWizardValue<K extends WizardField>(
  state: WizardState,
  field: K,
  value: WizardState[K],
): WizardState {
  return { ...state, [field]: value };
}

export interface OnboardingPreferences {
  interfaceLocale: string;
  learningLocale: string;
  explanationLocale: string;
  level: BookLevel;
}

/** The four values actually written to preferences, with Chinese resolved to
 * the chosen script. */
export function preferencesFrom(state: WizardState): OnboardingPreferences {
  return {
    interfaceLocale: state.interfaceLocale,
    learningLocale: state.learningLocale === 'zh' ? state.script : state.learningLocale,
    explanationLocale: state.explanationLocale,
    level: state.level,
  };
}
