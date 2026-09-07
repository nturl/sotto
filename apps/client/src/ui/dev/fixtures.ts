/**
 * Dev fixtures: six fake fr-FR books + the daily story, titles/authors as in
 * planning/design/system.html. These stand in for pack data until WS-4's
 * store selectors exist — src/ui/data.ts is the ONLY file that reads them.
 */
import type { BookCategory as CoreBookCategory } from '@sotto/core';

export type BookLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

/** Run 8 PLAN decision 3: collections are the seven core categories. The
 * three-value fixture taxonomy is gone; this re-export keeps the one
 * import path the screens already use. */
export type { BookCategory } from '@sotto/core';

export type FixtureBook = {
  id: string;
  title: string;
  author: string;
  shortAuthor: string;
  level: BookLevel;
  minutes: number;
  categories: CoreBookCategory[];
  /** 0..1 reading progress; > 0 puts the book on the "Reprendre" rail. */
  progress: number;
  isNew: boolean;
  synopsis: string;
};

export const FIXTURE_BOOKS: FixtureBook[] = [
  {
    id: 'renard',
    title: 'Renard',
    author: 'Maya Farah',
    shortAuthor: 'M. Farah',
    level: 'A1',
    minutes: 12,
    categories: ['fables'],
    progress: 0.64,
    isNew: false,
    synopsis:
      'Un jeune renard quitte sa tanière pour la première fois et découvre une ferme tranquille au bord de la rivière.',
  },
  {
    id: 'lanterne',
    title: 'Lanterne',
    author: 'Sana Okafor',
    shortAuthor: 'S. Okafor',
    level: 'A1',
    minutes: 9,
    categories: ['fables'],
    progress: 0,
    isNew: false,
    synopsis:
      'Une vieille lanterne éclaire le chemin des voyageurs et écoute leurs histoires, nuit après nuit.',
  },
  {
    id: 'riviere',
    title: 'Rivière',
    author: 'Léa Nadeau',
    shortAuthor: 'L. Nadeau',
    level: 'A2',
    minutes: 14,
    categories: ['adventure'],
    progress: 0.22,
    isNew: false,
    synopsis:
      'En suivant une rivière jusqu’à sa source, deux amis traversent des villages qui ne parlent qu’en chansons.',
  },
  {
    id: 'col',
    title: 'Col',
    author: 'Diego Reyes',
    shortAuthor: 'D. Reyes',
    level: 'A2',
    minutes: 11,
    categories: ['adventure'],
    progress: 0.08,
    isNew: false,
    synopsis:
      'Un berger traverse le col avant la neige et parie qu’il arrivera au village avant la première étoile.',
  },
  {
    id: 'dune',
    title: 'Dune',
    author: 'Maya Farah',
    shortAuthor: 'M. Farah',
    level: 'A0',
    minutes: 7,
    categories: ['adventure'],
    progress: 0,
    isNew: true,
    synopsis:
      'Une caravane s’arrête au pied d’une dune qui, dit-on, garde les mots que le vent a emportés.',
  },
  {
    id: 'nuit',
    title: 'Nuit',
    author: 'Ren Aoki',
    shortAuthor: 'R. Aoki',
    level: 'A0',
    minutes: 6,
    categories: ['tales'],
    progress: 0,
    isNew: true,
    synopsis:
      'La nuit tombe sur un petit port, et une enfant compte les étoiles pour aider la lune à se lever.',
  },
];

export const DAILY_BOOK: FixtureBook = {
  id: 'marche',
  title: 'Marché',
  author: 'Carmen Ibarra',
  shortAuthor: 'C. Ibarra',
  level: 'A1',
  minutes: 6,
  categories: ['tales'],
  progress: 0,
  isNew: false,
  synopsis:
    'Au marché du samedi, un petit marchand apprend à compter, à marchander et à dire merci en trois langues.',
};
