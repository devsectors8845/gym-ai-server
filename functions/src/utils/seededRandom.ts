/**
 * A tiny deterministic PRNG (mulberry32), used instead of `Math.random()` so
 * that "controlled randomness" (Step 10) actually is controlled: the same
 * seed always produces the same sequence, so the same profile generating a
 * plan in the same week is reproducible and testable, while different weeks
 * (a different seed) still get variety within the safe, filtered exercise
 * pool. This is deliberately NOT cryptographic — it's for varied-but-stable
 * exercise selection, not security.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string, used to turn a seed string (e.g. `${uid}:${goal}:${weekKey}`) into a numeric seed for `mulberry32`. */
export function hashStringToSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Fisher-Yates shuffle using a supplied deterministic RNG (from
 * `mulberry32`), instead of `Math.random()`. Does not mutate the input.
 */
export function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
