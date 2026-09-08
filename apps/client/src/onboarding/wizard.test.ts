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
 * Run 7 lane C, halved in run 10. Onboarding asks two things, each on its
 * own step, with the fast path's proposal already filled in — the learner
 * confirms rather than starts from nothing. The interface and explanation
 * languages are no longer asked: the browser already answers both, and a
 * stranger four screens from their first page cannot.
 */
describe('the two onboarding steps', () => {
  it('asks the learning language then the level, and nothing else', () => {
    expect(ONBOARDING_STEPS).toEqual(['learningLocale', 'level']);
    expect(ONBOARDING_STEPS).toHaveLength(2);
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
 * The one invariant the kickoff calls out by name: "changing one never
 * changes another". Two of the four values are defaults now rather than
 * questions, which makes this matter more, not less — an answered step must
 * never quietly rewrite a value the learner was never shown.
 */
describe('the four values are independent', () => {
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
  it('still writes all four preferences, the two asked and the two defaulted', () => {
    const state = setWizardValue(start('en'), 'level', 'A2');
    const preferences = preferencesFrom(state);
    expect(Object.keys(preferences).sort()).toEqual([
      'explanationLocale',
      'interfaceLocale',
      'learningLocale',
      'level',
    ]);
    expect(preferences).toEqual({
      interfaceLocale: 'en',
      learningLocale: 'fr-FR',
      explanationLocale: 'en',
      level: 'A2',
    });
  });

  it('keeps the browser-language defaults for the two steps that are gone', () => {
    const state = setWizardValue(start('fr'), 'learningLocale', 'it-IT');
    expect(preferencesFrom(state)).toEqual({
      interfaceLocale: 'fr',
      learningLocale: 'it-IT',
      explanationLocale: 'fr',
      level: 'A1',
    });
  });

  it('resolves Chinese to the chosen script', () => {
    let state = setWizardValue(start('en'), 'learningLocale', 'zh');
    state = setWizardValue(state, 'script', 'zh-TW');
    expect(preferencesFrom(state).learningLocale).toBe('zh-TW');
  });
});
