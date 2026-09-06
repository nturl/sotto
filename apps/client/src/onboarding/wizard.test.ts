import { describe, expect, it } from 'vitest';
import { fastPathDefaultsFor } from './fastPathDefaults';
import {
  ONBOARDING_STEPS,
  initialWizardState,
  preferencesFrom,
  setWizardValue,
  type WizardState,
} from './wizard';

function start(interfaceLocale: 'en' | 'fr' = 'en'): WizardState {
  return initialWizardState(fastPathDefaultsFor(interfaceLocale));
}

/**
 * Run 7 lane C. Onboarding asks four things, each on its own step, with the
 * fast path's proposal already filled in — the learner confirms rather than
 * starts from nothing. Recording 1: "my whole user flow is just not really
 * figured out."
 */
describe('the four onboarding steps', () => {
  it('asks interface language, learning language, level, explanation language, in that order', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'interfaceLocale',
      'learningLocale',
      'level',
      'explanationLocale',
    ]);
  });

  it('starts from the fast-path proposal rather than from blank', () => {
    const state = start('en');
    expect(state.interfaceLocale).toBe('en');
    expect(state.learningLocale).toBe('fr-FR');
    expect(state.explanationLocale).toBe('en');
    expect(state.level).toBe('A1');
  });

  it('proposes Spanish to a French speaker, so the two are never the same', () => {
    const state = start('fr');
    expect(state.interfaceLocale).toBe('fr');
    expect(state.learningLocale).toBe('es-419');
  });
});

/**
 * The one invariant the kickoff calls out by name: "four separate questions,
 * changing one never changes another". It is already true in the tree; this
 * is the test that keeps it true.
 */
describe('the four answers are independent', () => {
  it('changing the learning language never changes the interface language', () => {
    const state = setWizardValue(start('en'), 'learningLocale', 'it-IT');
    expect(state.learningLocale).toBe('it-IT');
    expect(state.interfaceLocale).toBe('en');
  });

  it('changing the learning language never changes the explanation language', () => {
    const state = setWizardValue(start('en'), 'learningLocale', 'zh');
    expect(state.explanationLocale).toBe('en');
  });

  it('changing the interface language never changes the learning language', () => {
    const state = setWizardValue(start('en'), 'interfaceLocale', 'pt');
    expect(state.interfaceLocale).toBe('pt');
    expect(state.learningLocale).toBe('fr-FR');
    expect(state.explanationLocale).toBe('en');
  });

  it('changing the level touches nothing else', () => {
    const before = start('en');
    const after = setWizardValue(before, 'level', 'B2');
    expect(after.level).toBe('B2');
    expect({ ...after, level: before.level }).toEqual(before);
  });
});

/**
 * Chinese is one row in the language list with the script picked separately,
 * so the preference that is actually written is the script, not `zh`.
 */
describe('what is written to preferences', () => {
  it('writes the four answers and nothing else', () => {
    const state = setWizardValue(start('en'), 'level', 'A2');
    expect(preferencesFrom(state)).toEqual({
      interfaceLocale: 'en',
      learningLocale: 'fr-FR',
      explanationLocale: 'en',
      level: 'A2',
    });
  });

  it('resolves Chinese to the chosen script', () => {
    let state = setWizardValue(start('en'), 'learningLocale', 'zh');
    state = setWizardValue(state, 'script', 'zh-TW');
    expect(preferencesFrom(state).learningLocale).toBe('zh-TW');
  });
});
