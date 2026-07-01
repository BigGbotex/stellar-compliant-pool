// Generic fixed-depth Merkle tree helpers. The root/path math here is the
// same "pad empty subtrees with zero[level]" convention used by the
// CompliantPool contract's incremental frontier tree (contracts/compliant_pool),
// just expressed as a plain from-leaves rebuild, which is simpler to reason
// about off-chain and was checked to produce identical roots/paths to the
// single-leaf frontier formula during development (see README "What's verified").
import { hash2 } from './hasher.mjs';

/** zero[0] = 0; zero[k] = hash2(zero[k-1], zero[k-1]). Shared by both trees. */
export async function buildZero(depth) {
  const zero = [0n];
  for (let k = 1; k <= depth; k++) {
    zero.push(await hash2(zero[k - 1], zero[k - 1]));
  }
  return zero;
}

/** Rebuilds every level of the tree bottom-up from real leaves, padding missing pairs with zero[level]. */
export async function buildLevels(leaves, zero, depth) {
  let level = leaves.slice();
  const levels = [level];
  for (let d = 0; d < depth; d++) {
    const next = [];
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

function getNode(levels, zero, d, p) {
  return p < levels[d].length ? levels[d][p] : zero[d];
}

/** Merkle path (siblings + bits) for leaf `idx`, plus the resulting root. */
export function pathFor(levels, zero, depth, idx) {
  const siblings = [];
  const bits = [];
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
