import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash2 } from "../../../lib/hasher";

const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function randomField(): bigint {
  const bytes = randomBytes(32);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v % FIELD_MODULUS;
}

export async function POST() {
  const nullifier = randomField();
  const secret = randomField();
  const commitment = await hash2(nullifier, secret);
  const nullifier_hash = await hash2(nullifier, 0n);
  return NextResponse.json({
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    commitment: commitment.toString(),
    nullifier_hash: nullifier_hash.toString(),
  });
}
