import { hash2 } from "./hasher";

export async function buildZero(depth: number): Promise<bigint[]> {
  const zero = [0n];
  for (let k = 1; k <= depth; k++) {
    zero.push(await hash2(zero[k - 1], zero[k - 1]));
  }
  return zero;
}

export async function buildLevels(leaves: bigint[], zero: bigint[], depth: number): Promise<bigint[][]> {
  let level = leaves.slice();
  const levels: bigint[][] = [level];
  for (let d = 0; d < depth; d++) {
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : zero[d];
      next.push(await hash2(left, right));
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

function getNode(levels: bigint[][], zero: bigint[], d: number, p: number): bigint {
  return p < levels[d].length ? levels[d][p] : zero[d];
}

export function pathFor(levels: bigint[][], zero: bigint[], depth: number, idx: number) {
  const siblings: bigint[] = [];
  const bits: number[] = [];
  let p = idx;
  for (let d = 0; d < depth; d++) {
    const bit = p & 1;
    siblings.push(getNode(levels, zero, d, bit === 0 ? p + 1 : p - 1));
    bits.push(bit);
    p = Math.floor(p / 2);
  }
  const root = levels[depth].length > 0 ? levels[depth][0] : zero[depth];
  return { siblings, bits, root };
}

export const TREE_DEPTH = 20;
export const ASP_DEPTH = 8;
