import { LimitationTag } from "../types/workout";

/**
 * The questionnaire's injury/limitation field (`modifications`, from
 * `src/screens/Questionnaire/Modifications.js`) is free text — there is no
 * fixed checklist of injuries in the app today. This module is a
 * deterministic keyword normalizer, NOT natural-language understanding or
 * AI (Step 14 forbids AI making safety-critical decisions): it looks for a
 * small, fixed vocabulary of body-region keywords and maps them to
 * `LimitationTag`s that `exerciseCatalog.ts` entries carry as
 * `contraindications`.
 *
 * This is a best-effort, conservative normalizer, not medical NLP. It will
 * both under-match (a limitation described without one of these keywords,
 * e.g. "my rotator cuff is acting up" without the word "shoulder", produces
 * no tag) and can over-match on ambiguous phrasing. See the final report's
 * "issues/follow-up" section for this explicitly — it is a known, disclosed
 * limitation of working from unstructured free text, not a claim of
 * complete injury coverage. A follow-up task should replace the free-text
 * field with a fixed multi-select so this can be exact.
 */
const LIMITATION_KEYWORDS: Record<LimitationTag, string[]> = {
  knee: ["knee"],
  shoulder: ["shoulder", "rotator cuff"],
  lower_back: ["lower back", "low back", "lumbar", "herniated disc", "sciatica", "back injury", "back pain", "spine"],
  wrist: ["wrist", "carpal tunnel"],
  ankle: ["ankle"],
  hip: ["hip"],
  neck: ["neck", "cervical"],
  elbow: ["elbow", "tennis elbow", "golfer's elbow", "golfers elbow"],
};

const NO_LIMITATION_PHRASES = new Set([
  "",
  "none",
  "no",
  "n/a",
  "na",
  "nope",
  "no injuries",
  "no injury",
  "no limitations",
  "no limitation",
  "no issues",
  "no modifications needed",
  "not applicable",
]);

const NEGATION_WORDS = ["no", "not", "without", "never had", "n/a"];

/** True if `keyword`'s occurrence at `index` in `text` is immediately preceded by a negation word within a short window. */
function isNegated(text: string, index: number): boolean {
  const windowStart = Math.max(0, index - 20);
  const window = text.slice(windowStart, index);
  return NEGATION_WORDS.some((neg) => window.includes(neg));
}

/**
 * Parses the free-text `modifications` field into a deduplicated set of
 * `LimitationTag`s. Returns `[]` for empty/absent/explicitly-"none" input —
 * that is a legitimate, common case (most users have no limitations), not
 * an error.
 */
export function parseLimitations(raw: unknown): LimitationTag[] {
  const text = String(raw ?? "").toLowerCase().trim();

  if (NO_LIMITATION_PHRASES.has(text)) {
    return [];
  }

  const found = new Set<LimitationTag>();

  for (const [tag, keywords] of Object.entries(LIMITATION_KEYWORDS) as [LimitationTag, string[]][]) {
    for (const keyword of keywords) {
      let searchFrom = 0;
      let index = text.indexOf(keyword, searchFrom);
      while (index !== -1) {
        if (!isNegated(text, index)) {
          found.add(tag);
          break;
        }
        searchFrom = index + keyword.length;
        index = text.indexOf(keyword, searchFrom);
      }
    }
  }

  return Array.from(found);
}
