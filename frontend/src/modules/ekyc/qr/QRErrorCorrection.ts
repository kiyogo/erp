/**
 * QRErrorCorrection.ts
 * Reed-Solomon Error Correction over GF(256) — thuần TypeScript, không thư viện
 * Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1 = 0x11D
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGF256() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

const generatorCache: Record<number, Uint8Array> = {};
function getGeneratorPoly(degree: number): Uint8Array {
  if (generatorCache[degree]) return generatorCache[degree];
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const newPoly = new Uint8Array(poly.length + 1);
    const ai = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j];
      newPoly[j + 1] ^= gfMul(poly[j], ai);
    }
    poly = newPoly;
  }
  return (generatorCache[degree] = poly);
}

export function generateECCodewords(dataCodewords: number[], ecCount: number): number[] {
  const gen = getGeneratorPoly(ecCount);
  const rem = new Uint8Array(dataCodewords.length + ecCount);
  for (let i = 0; i < dataCodewords.length; i++) rem[i] = dataCodewords[i];
  for (let i = 0; i < dataCodewords.length; i++) {
    const c = rem[i];
    if (c !== 0) for (let j = 0; j < gen.length; j++) rem[i + j] ^= gfMul(gen[j], c);
  }
  return Array.from(rem.slice(dataCodewords.length));
}
