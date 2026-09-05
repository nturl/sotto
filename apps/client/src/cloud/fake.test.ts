import { describe, expect, it } from 'vitest';
import { FakeCloudAdapter } from './fake';
import { CloudError } from './types';

describe('FakeCloudAdapter', () => {
  it('is enabled and starts signed out', async () => {
    const cloud = new FakeCloudAdapter();
    expect(cloud.enabled).toBe(true);
    expect(await cloud.me()).toBeNull();
  });

  it('signs in with Apple and returns a free entitlement', async () => {
    const cloud = new FakeCloudAdapter();
    const me = await cloud.signInWithApple('token', 'web');
    expect(me.user.email).toBeTruthy();
    expect(me.entitlement.plan).toBe('free');
    expect(await cloud.me()).toEqual(me);
  });

  it('signs out', async () => {
    const cloud = new FakeCloudAdapter();
    await cloud.signInWithApple('token', 'web');
    await cloud.signOut();
    expect(await cloud.me()).toBeNull();
  });

  it('lists the standard plan (sotto-cloud R4-D1 trimmed table)', async () => {
    const cloud = new FakeCloudAdapter();
    const { plans, billing } = await cloud.plans();
    expect(billing).toBe('stub');
    expect(plans.map((p) => p.id)).toEqual(['standard']);
  });

  it('stubSubscribe upgrades the entitlement', async () => {
    const cloud = new FakeCloudAdapter();
    await cloud.signInWithApple('token', 'web');
    const entitlement = await cloud.stubSubscribe('standard');
    expect(entitlement.plan).toBe('standard');
    expect(entitlement.tutorMinutesCap).toBe(250);
    expect((await cloud.me())?.entitlement.plan).toBe('standard');
  });

  it('voiceSession throws plan_required on the free plan', async () => {
    const cloud = new FakeCloudAdapter();
    await cloud.signInWithApple('token', 'web');
    await expect(
      cloud.voiceSession({
        bookId: 'b',
        chapterId: 'c',
        mode: 'discuss',
        learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
        passage: { chapterTitle: '', sentences: [], positionTokenId: '' },
        savedWords: [],
      }),
    ).rejects.toMatchObject({ code: 'plan_required' });
  });

  it('voiceSession succeeds with remaining minutes on a paid plan', async () => {
    const cloud = new FakeCloudAdapter();
    await cloud.signInWithApple('token', 'web');
    await cloud.stubSubscribe('standard');
    const session = await cloud.voiceSession({
      bookId: 'b',
      chapterId: 'c',
      mode: 'discuss',
      learner: { level: 'A1', learningLocale: 'fr-FR', explanationLocale: 'en' },
      passage: { chapterTitle: '', sentences: [], positionTokenId: '' },
      savedWords: [],
    });
    expect(session.wsUrl).toMatch(/^wss:\/\//);
    expect(session.remainingSeconds).toBeGreaterThan(0);
  });

  it('deleteAccount requires being signed in', async () => {
    const cloud = new FakeCloudAdapter();
    await expect(cloud.deleteAccount()).rejects.toBeInstanceOf(CloudError);
  });
});
