/**
 * Strips `[[reading: id1 id2]]` and `[[pace: slow|normal]]` control markers
 * out of LLM output text, extracting their payloads. The LLM is instructed
 * (src/voice/prompt.ts) to emit these inline; the client/learner never sees
 * the marker text itself.
 */

const READING_RE = /\[\[reading:\s*([^\]]*)\]\]/gi;
const PACE_RE = /\[\[pace:\s*(slow|normal)\]\]/gi;

export interface StrippedMarkers {
  text: string;
  readingTokenIds: string[];
  pace: 'slow' | 'normal' | null;
}

export function stripMarkers(input: string): StrippedMarkers {
  const readingTokenIds: string[] = [];
  let pace: 'slow' | 'normal' | null = null;

  let text = input.replace(READING_RE, (_m, ids: string) => {
    for (const id of ids.trim().split(/\s+/).filter(Boolean)) {
      readingTokenIds.push(id);
    }
    return '';
  });

  text = text.replace(PACE_RE, (_m, p: string) => {
    pace = p.toLowerCase() as 'slow' | 'normal';
    return '';
  });

  return { text, readingTokenIds, pace };
}
