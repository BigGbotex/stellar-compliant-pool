import { NextResponse } from "next/server";
import { hash2 } from "../../../lib/hasher";
import { buildZero, buildLevels, pathFor, TREE_DEPTH, ASP_DEPTH } from "../../../lib/merkle";
import { getState, liveAspLeaves } from "../../../lib/state";

export async function POST(req: Request) {
  const body = await req.json();
  const poolIndex = Number(body.poolIndex);
  const aspIndex = Number(body.aspIndex);
  const nullifier = BigInt(body.nullifier);
  const secret = BigInt(body.secret);
  const identitySecret = BigInt(body.identitySecret);

  const state = getState();
  const poolLeaves = state.poolDeposits.map((d) => BigInt(d.commitment));
  const aspLeaves = liveAspLeaves(state);

  if (poolIndex < 0 || poolIndex >= poolLeaves.length) {
    return NextResponse.json({ error: `poolIndex ${poolIndex} out of range` }, { status: 400 });
  }
  if (aspIndex < 0 || aspIndex >= aspLeaves.length) {
    return NextResponse.json({ error: `aspIndex ${aspIndex} out of range` }, { status: 400 });
  }

  const expectedLeaf = await hash2(nullifier, secret);
  if (poolLeaves[poolIndex] !== expectedLeaf) {
    return NextResponse.json(
      { error: "Your (nullifier, secret) does not match the deposit at poolIndex. Check your saved note." },
      { status: 400 }
    );
  }
  const expectedAspLeaf = await hash2(identitySecret, 0n);
  if (aspLeaves[aspIndex] !== expectedAspLeaf) {
    const identity = state.aspIdentities[aspIndex];
    const reason =
      identity?.status === "revoked"
        ? `This identity was revoked from the ASP allow-list. A valid proof can no longer be produced for it.`
        : `Your identitySecret does not match aspIndex ${aspIndex}.`;
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const zero = await buildZero(TREE_DEPTH);
  const poolLevels = await buildLevels(poolLeaves, zero, TREE_DEPTH);
  const { siblings: path_siblings, bits: path_bits, root } = pathFor(poolLevels, zero, TREE_DEPTH, poolIndex);

  const aspLevels = await buildLevels(aspLeaves, zero, ASP_DEPTH);
  const {
    siblings: asp_path_siblings,
    bits: asp_path_bits,
    root: asp_root,
  } = pathFor(aspLevels, zero, ASP_DEPTH, aspIndex);

  const nullifier_hash = await hash2(nullifier, 0n);

  const witness = {
    root: root.toString(),
    nullifier_hash: nullifier_hash.toString(),
    asp_root: asp_root.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    path_siblings: path_siblings.map(String),
    path_bits: path_bits.map(String),
    identity_secret: identitySecret.toString(),
    asp_path_siblings: asp_path_siblings.map(String),
    asp_path_bits: asp_path_bits.map(String),
  };

  return NextResponse.json({ witness, publicInputs: { root: witness.root, nullifier_hash: witness.nullifier_hash, asp_root: witness.asp_root } });
}
