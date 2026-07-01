import { randomBytes } from 'crypto';
import fs from 'fs';
import { hash2 } from './lib/hasher.mjs';

const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function randomField() {
  const bytes = randomBytes(32);
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v % FIELD_MODULUS;
}

const nullifier = randomField();
const secret = randomField();
const commitment = await hash2(nullifier, secret);
const nullifier_hash = await hash2(nullifier, 0n);

const note = {
  nullifier: nullifier.toString(),
  secret: secret.toString(),
  commitment: commitment.toString(),
  nullifier_hash: nullifier_hash.toString(),
};

fs.writeFileSync(process.argv[2] || 'note.json', JSON.stringify(note, null, 2));
console.error('\nWrote note.json');
console.error('Keep "nullifier" and "secret" private. Send "commitment" to CompliantPoolContract.deposit().');
