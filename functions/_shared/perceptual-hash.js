// Perceptual image hashing (dHash: difference hash) -- pure JS, no
// dependencies. Detects visually similar/duplicate images even after
// re-compression, resizing, or minor edits (unlike a cryptographic hash,
// which changes completely on any byte difference).
//
// Algorithm: downscale to a small grayscale grid, then encode whether each
// pixel is brighter or darker than its right neighbor as a single bit.
// Two images with a small Hamming distance between their hashes look
// visually similar; a large distance means they're visually different.

const HASH_WIDTH = 9;  // 9 columns -> 8 horizontal comparisons per row
const HASH_HEIGHT = 8;

// Box-average downsampling from (srcW x srcH) RGBA pixels to a small
// (dstW x dstH) grayscale grid. Averaging (rather than nearest-neighbor)
// avoids aliasing artifacts that would make the hash unstable.
function resizeToGrayscale(rgba, srcW, srcH, dstW, dstH) {
  const gray = new Float64Array(dstW * dstH);

  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy / dstH) * srcH);
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) / dstH) * srcH));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx / dstW) * srcW);
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) / dstW) * srcW));

      let sum = 0;
      let count = 0;
      for (let sy = y0; sy < y1 && sy < srcH; sy++) {
        for (let sx = x0; sx < x1 && sx < srcW; sx++) {
          const i = (sy * srcW + sx) * 4;
          // Standard luminosity weighting.
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          count++;
        }
      }
      gray[dy * dstW + dx] = count > 0 ? sum / count : 0;
    }
  }
  return gray;
}

// Returns a 64-bit hash encoded as a 16-character hex string.
export function dHash(rgba, width, height) {
  const gray = resizeToGrayscale(rgba, width, height, HASH_WIDTH, HASH_HEIGHT);

  let bits = '';
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = gray[y * HASH_WIDTH + x];
      const right = gray[y * HASH_WIDTH + x + 1];
      bits += left > right ? '1' : '0';
    }
  }
  // bits.length === 64. Convert to hex, 4 bits at a time.
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

// Number of differing bits between two hex-encoded hashes of the same
// length. 0 = identical, higher = more different. For a 64-bit dHash,
// values below ~10 typically indicate visually similar images.
export function hammingDistance(hexA, hexB) {
  if (hexA.length !== hexB.length) throw new Error('Hash length mismatch.');
  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    const a = parseInt(hexA[i], 16);
    const b = parseInt(hexB[i], 16);
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

// Converts a Hamming distance (0-64 for this hash size) to a 0-100
// similarity percentage.
export function similarityPercent(distance, hashBits = 64) {
  return Math.round((1 - distance / hashBits) * 100);
}
