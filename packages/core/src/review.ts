/**
 * SM-2-lite spaced repetition scheduler for saved words (planning/CONTRACTS.md §3).
 *
 * Interval formulas are given exactly by the contract: `again` resets to
 * due-now and counts a lapse; `hard` grows the interval by a fixed 1.2x;
 * `easy` grows it by the word's current ease factor. The contract fixes the
 * ease start (2.5) and clamp range ([1.3, 3.0]) but not the per-rating ease
 * delta, so this file picks a conventional SM-2-style delta (again -0.2,
 * hard -0.15, easy +0.15) — see the WS-1 report.
 */
import type { ReviewRating, SavedWord, WordReview } from './models.ts';

const EASE_START = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 3.0;
const EASE_DELTA: Record<ReviewRating, number> = { again: -0.2, hard: -0.15, easy: 0.15 };
const DAY_MS = 24 * 60 * 60 * 1000;

function clampEase(value: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, value));
}

export function initialReview(now: Date): WordReview {
  return {
    ease: EASE_START,
    intervalDays: 0,
    dueAt: now.toISOString(),
    reps: 0,
    lapses: 0,
  };
}

export function scheduleReview(prev: WordReview, rating: ReviewRating, now: Date): WordReview {
  let intervalDays: number;
  if (rating === 'again') {
    intervalDays = 0;
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, prev.intervalDays * 1.2);
  } else {
    intervalDays = Math.max(1, prev.intervalDays * prev.ease);
  }

  return {
    ease: clampEase(prev.ease + EASE_DELTA[rating]),
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    reps: prev.reps + 1,
    lapses: rating === 'again' ? prev.lapses + 1 : prev.lapses,
    lastRating: rating,
  };
}

export function dueWords<T extends Pick<SavedWord, 'review'>>(words: T[], now: Date): T[] {
  const nowMs = now.getTime();
  return words.filter((w) => new Date(w.review.dueAt).getTime() <= nowMs);
}
