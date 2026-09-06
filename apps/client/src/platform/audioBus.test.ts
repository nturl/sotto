import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetAudioBusForTests, claimAudio, currentAudioOwner, releaseAudio } from './audioBus';

afterEach(() => {
  __resetAudioBusForTests();
});

describe('audioBus', () => {
  it('has no owner before any claim', () => {
    expect(currentAudioOwner()).toBeNull();
  });

  it('starting word audio while narration plays stops narration', () => {
    const stopNarration = vi.fn();
    const stopWord = vi.fn();
    claimAudio('narration', stopNarration);
    expect(currentAudioOwner()).toBe('narration');

    claimAudio('word', stopWord);
    expect(stopNarration).toHaveBeenCalledTimes(1);
    expect(stopWord).not.toHaveBeenCalled();
    expect(currentAudioOwner()).toBe('word');
  });

  it('starting tutor speech stops whichever of narration/word was playing', () => {
    const stopWord = vi.fn();
    const stopTutor = vi.fn();
    claimAudio('word', stopWord);
    claimAudio('tutor', stopTutor);
    expect(stopWord).toHaveBeenCalledTimes(1);
    expect(currentAudioOwner()).toBe('tutor');
  });

  it('starting narration while tutor speech plays stops tutor speech', () => {
    const stopTutor = vi.fn();
    const stopNarration = vi.fn();
    claimAudio('tutor', stopTutor);
    claimAudio('narration', stopNarration);
    expect(stopTutor).toHaveBeenCalledTimes(1);
    expect(currentAudioOwner()).toBe('narration');
  });

  it('re-claiming the same owner does not call its own stop', () => {
    const stopWord = vi.fn();
    claimAudio('word', stopWord);
    claimAudio('word', vi.fn());
    expect(stopWord).not.toHaveBeenCalled();
    expect(currentAudioOwner()).toBe('word');
  });

  it('release clears the bus only when the releaser is still the current owner', () => {
    claimAudio('narration', vi.fn());
    releaseAudio('word'); // stale/mismatched release — must not clear narration
    expect(currentAudioOwner()).toBe('narration');

    releaseAudio('narration');
    expect(currentAudioOwner()).toBeNull();
  });

  it('a claim after release does not try to stop a released owner', () => {
    const stopNarration = vi.fn();
    claimAudio('narration', stopNarration);
    releaseAudio('narration');
    claimAudio('word', vi.fn());
    expect(stopNarration).not.toHaveBeenCalled();
  });
});
