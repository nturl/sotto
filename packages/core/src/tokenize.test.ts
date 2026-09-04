import { describe, expect, it } from 'vitest';
import { tokenizeSentence } from './tokenize.ts';

function words(text: string, strategy: 'latin' | 'presegmented' = 'latin') {
  return tokenizeSentence(text, strategy).map((t) => t.text);
}

describe('tokenizeSentence (latin)', () => {
  it('splits plain words and punctuation, tracking spaceBefore', () => {
    const tokens = tokenizeSentence('Le renard court.', 'latin');
    expect(tokens.map((t) => t.text)).toEqual(['Le', 'renard', 'court', '.']);
    expect(tokens.map((t) => t.isWord)).toEqual([true, true, true, false]);
    expect(tokens.map((t) => t.spaceBefore)).toEqual([false, true, true, false]);
    expect(tokens.map((t) => t.normalized)).toEqual(['le', 'renard', 'court', '.']);
  });

  it('keeps "aujourd\'hui" as a single token (prefix not a known clitic)', () => {
    const tokens = tokenizeSentence("On sort aujourd'hui.", 'latin');
    expect(words("On sort aujourd'hui.")).toEqual(['On', 'sort', "aujourd'hui", '.']);
    const word = tokens.find((t) => t.text === "aujourd'hui");
    expect(word?.isWord).toBe(true);
    expect(word?.normalized).toBe("aujourd'hui");
  });

  it("splits known French clitics: l', d', qu', c', jusqu'", () => {
    expect(words("l'enfant")).toEqual(["l'", 'enfant']);
    expect(words("d'un village")).toEqual(["d'", 'un', 'village']);
    expect(words("qu'il vienne")).toEqual(["qu'", 'il', 'vienne']);
    expect(words("c'est vrai")).toEqual(["c'", 'est', 'vrai']);
    expect(words("jusqu'ici")).toEqual(["jusqu'", 'ici']);
  });

  it('normalizes a curly apostrophe on a split clitic to a straight one', () => {
    const tokens = tokenizeSentence('l’enfant', 'latin');
    expect(tokens.map((t) => t.text)).toEqual(['l’', 'enfant']);
    expect(tokens[0]?.normalized).toBe("l'");
  });

  it('keeps hyphenated words as one token', () => {
    expect(words('Sa grand-mère arrive.')).toEqual(['Sa', 'grand-mère', 'arrive', '.']);
  });

  it('splits Spanish inverted punctuation as its own tokens', () => {
    const tokens = tokenizeSentence('¿Qué?', 'latin');
    expect(tokens.map((t) => t.text)).toEqual(['¿', 'Qué', '?']);
    expect(tokens.map((t) => t.isWord)).toEqual([false, true, false]);
    expect(tokens.map((t) => t.spaceBefore)).toEqual([false, false, false]);
  });

  it("splits Catalan clitics l' and m'", () => {
    expect(words("l'ase")).toEqual(["l'", 'ase']);
    expect(words("m'agrada")).toEqual(["m'", 'agrada']);
  });

  it("splits Portuguese clitic d'", () => {
    expect(words("d'água")).toEqual(["d'", 'água']);
  });
});

describe('tokenizeSentence (presegmented)', () => {
  it('splits on ASCII spaces and marks CJK punctuation as non-word', () => {
    const tokens = tokenizeSentence('从前 有 一个 农夫 。', 'presegmented');
    expect(tokens.map((t) => t.text)).toEqual(['从前', '有', '一个', '农夫', '。']);
    expect(tokens.map((t) => t.isWord)).toEqual([true, true, true, true, false]);
    expect(tokens.every((t) => t.spaceBefore === false)).toBe(true);
  });

  it('treats other CJK punctuation in the given set as non-word too', () => {
    const tokens = tokenizeSentence('他 说 ： “ 你好 ！ ”', 'presegmented');
    const map = Object.fromEntries(tokens.map((t) => [t.text, t.isWord]));
    expect(map['：']).toBe(false);
    expect(map['“']).toBe(false);
    expect(map['！']).toBe(false);
    expect(map['”']).toBe(false);
    expect(map['他']).toBe(true);
    expect(map['你好']).toBe(true);
  });
});
