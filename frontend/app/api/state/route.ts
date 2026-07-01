import { NextResponse } from "next/server";
import { getState, liveAspLeaves } from "../../../lib/state";
import { buildZero, buildLevels, TREE_DEPTH, ASP_DEPTH } from "../../../lib/merkle";

export async function GET() {
  const state = getState();
  const zero = await buildZero(TREE_DEPTH);

  const poolLeaves = state.poolDeposits.map((d) => BigInt(d.commitment));
  const poolLevels = await buildLevels(poolLeaves, zero, TREE_DEPTH);
  const poolRoot = poolLevels[TREE_DEPTH][0]?.toString() ?? zero[TREE_DEPTH].toString();

  const aspLeavesLive = liveAspLeaves(state);
  const aspLevels = await buildLevels(aspLeavesLive, zero, ASP_DEPTH);
  const aspRoot = aspLevels[ASP_DEPTH][0]?.toString() ?? zero[ASP_DEPTH].toString();

  return NextResponse.json({
    poolDeposits: state.poolDeposits,
    aspIdentities: state.aspIdentities,
    poolRoot,
    aspRoot,
  });
}
