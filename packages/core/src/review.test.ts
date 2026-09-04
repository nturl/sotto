import { describe, expect, it } from 'vitest';
import { dueWords, initialReview, scheduleReview } from './review.ts';
import type { WordReview } from './models.ts';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('initialReview', () => {
  it('starts at ease 2.5, interval 0, due immediately', () => {
    const r = initialReview(NOW);
    expect(r.ease).toBe(2.5);
    expect(r.intervalDays).toBe(0);
    expect(r.dueAt).toBe(NOW.toISOString());
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(0);
  });
});

describe('scheduleReview', () => {
  it('again resets interval to 0 (due now) and increments lapses + reps', () => {
    const prev: WordReview = {
      ease: 2.5,
      intervalDays: 6,
      dueAt: NOW.toISOString(),
      reps: 3,
      lapses: 0,
    };
    const next = scheduleReview(prev, 'again', NOW);
    expect(next.intervalDays).toBe(0);
    expect(next.dueAt).toBe(NOW.toISOString());
    expect(next.lapses).toBe(1);
    expect(next.reps).toBe(4);
    expect(next.lastRating).toBe('again');
    expect(next.ease).toBeCloseTo(2.3);
  });

  it('hard grows the interval by 1.2x, floored at 1 day, and does not touch lapses', () => {
    const prev: WordReview = {
      ease: 2.5,
      intervalDays: 2,
      dueAt: NOW.toISOString(),
      reps: 1,
      lapses: 0,
    };
    const next = scheduleReview(prev, 'hard', NOW);
    expect(next.intervalDays).toBeCloseTo(2.4);
    expect(next.dueAt).toBe(new Date(NOW.getTime() + 2.4 * DAY_MS).toISOString());
    expect(next.lapses).toBe(0);
  });

  it('hard on a fresh (interval 0) word floors to 1 day', () => {
    const prev = initialReview(NOW);
    const next = scheduleReview(prev, 'hard', NOW);
    expect(next.intervalDays).toBe(1);
  });

  it('easy grows the interval by the previous ease factor, floored at 1 day', () => {
    const prev: WordReview = {
      ease: 2.5,
      intervalDays: 2,
      dueAt: NOW.toISOString(),
      reps: 1,
      lapses: 0,
    };
    const next = scheduleReview(prev, 'easy', NOW);
    expect(next.intervalDays).toBeCloseTo(5);
    expect(next.ease).toBeCloseTo(2.65);
  });

  it('easy on a fresh (interval 0) word floors to 1 day', () => {
    const prev = initialReview(NOW);
    const next = scheduleReview(prev, 'easy', NOW);
    expect(next.intervalDays).toBe(1);
  });

  it('clamps ease into [1.3, 3.0]', () => {
    let review: WordReview = initialReview(NOW);
    for (let i = 0; i < 20; i++) {
      review = scheduleReview(review, 'again', NOW);
    }
    expect(review.ease).toBeGreaterThanOrEqual(1.3);

    review = initialReview(NOW);
    for (let i = 0; i < 10; i++) {
      review = scheduleReview(review, 'easy', NOW);
    }
    expect(review.ease).toBeLessThanOrEqual(3.0);
  });
});

describe('dueWords', () => {
  it('returns only words whose review.dueAt is at or before now', () => {
    const past = {
      review: { ...initialReview(NOW), dueAt: new Date(NOW.getTime() - DAY_MS).toISOString() },
    };
    const future = {
      review: { ...initialReview(NOW), dueAt: new Date(NOW.getTime() + DAY_MS).toISOString() },
    };
    const dueNow = { review: initialReview(NOW) };
    const result = dueWords([past, future, dueNow], NOW);
    expect(result).toEqual([past, dueNow]);
  });
});
