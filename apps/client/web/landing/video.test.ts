import { readFileSync, statSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The one-minute explainer (2026-09-24) leads "See it working". It is the
 * heaviest file the landing serves, so nothing may fetch it before a visitor
 * presses play, and its narration needs captions every browser will show.
 */
describe('the landing page explainer video', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const preview = html.slice(
    html.indexOf('<section id="preview">'),
    html.indexOf('<section id="install">'),
  );
  const video = preview.slice(preview.indexOf('<video'), preview.indexOf('</video>'));
  const tag = video.slice(0, video.indexOf('>'));
  const file = (name: string) => new URL(`../../public/landing/${name}`, import.meta.url);

  it('sits in See it working and downloads nothing until play', () => {
    expect(tag).toMatch(/^<video\b/);
    expect(tag).toContain('controls');
    expect(tag).toContain('preload="none"');
    expect(tag).not.toContain('autoplay');
  });

  it('ships the video and its poster as files the export copies to /landing/', () => {
    expect(tag).toContain('poster="/landing/explainer.jpg"');
    expect(video).toContain('<source src="/landing/explainer.mp4" type="video/mp4" />');
    const mp4 = readFileSync(file('explainer.mp4'));
    expect(mp4.subarray(4, 8).toString('latin1')).toBe('ftyp');
    // moov ahead of mdat (ffmpeg -movflags +faststart) lets playback start
    // before the whole file has arrived.
    expect(mp4.indexOf('moov')).toBeLessThan(mp4.indexOf('mdat'));
    const poster = readFileSync(file('explainer.jpg'));
    expect(poster.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(poster.subarray(-2).toString('hex')).toBe('ffd9');
  });

  it('is the web encode, not the 16 MB master', () => {
    // The master in the video project carries CRF 16 and a mov_text caption
    // stream Safari would list beside the track below; the web copy is CRF 23
    // with captions only in the .vtt.
    expect(statSync(file('explainer.mp4')).size).toBeLessThan(8 * 1024 * 1024);
  });

  it('carries English captions for the narration', () => {
    expect(video).toMatch(
      /<track\s+kind="captions"\s+src="\/landing\/explainer\.en\.vtt"\s+srclang="en"\s+label="English"/,
    );
    expect(readFileSync(file('explainer.en.vtt'), 'utf8')).toMatch(
      /^WEBVTT\n\n1\n00:00:00\.500 --> /,
    );
  });
});
