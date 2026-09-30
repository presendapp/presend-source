// SimHash: locality-sensitive hashing for near-duplicate TEXT detection --
// the text equivalent of the perceptual image hash (dHash) already built
// for /api/image-similarity. Two texts that say roughly the same thing
// (paraphrased, lightly edited, copy-pasted with small changes) hash close
// together, even though a cryptographic hash of the same texts would be
// completely different.
//
// Algorithm: split into overlapping word shingles, hash each shingle to a
// 64-bit value (FNV-1a), then for each of the 64 bit positions sum +1/-1
// across all shingles depending on whether that bit was set. The final
// hash bit is 1 wherever the sum is positive.

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

// FNV-1a 64-bit hash of a string, as a BigInt.
function fnv1a64(str) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

// Normalizes and splits text into overlapping N-word shingles. Falls back
// to the whole text as a single shingle if there aren't enough words.
function shingles(text, n = 3) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/digits/whitespace
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return [];
  if (words.length <= n) return [words.join(' ')];

  const result = [];
  for (let i = 0; i <= words.length - n; i++) {
    result.push(words.slice(i, i + n).join(' '));
  }
  return result;
}

// Returns a 64-bit SimHash encoded as a 16-character hex string, or null
// if the text has no usable content (empty after normalization).
export function simHash(text, shingleSize = 3) {
  const shs = shingles(text, shingleSize);
  if (shs.length === 0) return null;

  const weights = new Array(64).fill(0);
  for (const sh of shs) {
    const h = fnv1a64(sh);
    for (let bit = 0; bit < 64; bit++) {
      const isSet = (h >> BigInt(bit)) & 1n;
      weights[bit] += isSet ? 1 : -1;
    }
  }

  let hashBits = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (weights[bit] > 0) hashBits |= (1n << BigInt(bit));
  }

  return hashBits.toString(16).padStart(16, '0');
}
