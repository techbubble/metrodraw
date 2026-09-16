import type { Pt } from "../types";

// Eight octilinear directions, indexed clockwise from east (y grows down).
export const DIRS: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function angleSteps(a: number, b: number): number {
  const d = Math.abs(a - b) % 8;
  return Math.min(d, 8 - d);
}

export function dirIndex(dx: number, dy: number): number {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let i = 0; i < 8; i++) if (DIRS[i][0] === sx && DIRS[i][1] === sy) return i;
  return 0;
}

// Nearest octilinear direction to an arbitrary vector.
export function snapDir(vx: number, vy: number): number {
  let best = 0, bestDot = -Infinity;
  const l = Math.hypot(vx, vy) || 1;
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = DIRS[i];
    const dl = Math.hypot(dx, dy);
    const dot = (vx * dx + vy * dy) / (l * dl);
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}

export const key = (p: Pt) => p[0] * 4096 + p[1];
export const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
export const sameAxis = (a: number, b: number) => a % 4 === b % 4;
