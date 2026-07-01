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

const identitySecret = randomField();
const leaf = await hash2(identitySecret, 0n);
const identity = { identitySecret: identitySecret.toString(), leaf: leaf.toString() };

fs.writeFileSync(process.argv[2] || 'identity.json', JSON.stringify(identity, null, 2));
console.error('\nWrote identity.json');
console.error('Keep "identitySecret" private. "leaf" is what the ASP allow-list publishes alongside its root.');
