/** Stateless deterministic hashing: identical inputs always yield identical numbers (no Math.random). */
export function hashStr(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mix(a: number, b: number, c: number): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export const uniform = (a: number, b: number, c: number) => (mix(a, b, c) + 0.5) / 4294967296;

export function normal(a: number, b: number, c: number): number {
  const u1 = uniform(a, b, c * 2 + 1);
  const u2 = uniform(a ^ 0x5bd1e995, b, c * 2 + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
