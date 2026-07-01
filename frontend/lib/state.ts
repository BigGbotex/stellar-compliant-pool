// In-memory stand-in for what a real frontend would read from chain:
// - poolCommitments would come from CompliantPoolContract DepositEvent history
// - aspIdentities would come from whatever off-chain list the compliance
//   authority publishes alongside the root it sets on AspRegistry
//
// This is intentionally a single in-process array, not a database - good
// enough to demo the deposit -> withdraw -> "what if you get removed from
// the allow-list" flow end to end, not meant to survive a server restart or
// run across multiple instances. See README "What's real vs simplified".
import { hash2 } from "./hasher";

export type PoolDeposit = { commitment: string; label: string };
export type AspIdentity = { leaf: string; label: string; status: "allowed" | "revoked" };

type State = {
  poolDeposits: PoolDeposit[];
  aspIdentities: AspIdentity[];
};

const g = globalThis as unknown as { __poolState?: State };

function seedState(): State {
  return { poolDeposits: [], aspIdentities: [] };
}

export function getState(): State {
  if (!g.__poolState) g.__poolState = seedState();
  return g.__poolState;
}

export async function addAspIdentity(label: string, identitySecret: bigint) {
  const state = getState();
  const leaf = await hash2(identitySecret, 0n);
  state.aspIdentities.push({ leaf: leaf.toString(), label, status: "allowed" });
}

export function revokeAspIdentity(index: number) {
  const state = getState();
  if (state.aspIdentities[index]) state.aspIdentities[index].status = "revoked";
}

/** Leaves currently counted as allow-listed, in their original tree positions
 * (revoked entries are replaced with a sentinel so the tree shape/positions
 * of everyone else stay stable - simplification documented in README). */
export function liveAspLeaves(state: State): bigint[] {
  const REVOKED_SENTINEL = 1n; // any fixed value no real identity leaf will collide with in practice
  return state.aspIdentities.map((id) => (id.status === "allowed" ? BigInt(id.leaf) : REVOKED_SENTINEL));
}
