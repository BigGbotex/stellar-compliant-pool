import fs from 'fs';
import { hash2 } from './lib/hasher.mjs';

const bob = JSON.parse(fs.readFileSync('identity-bob.json', 'utf8'));

const DEPTH = 8;
const zero = [0n];
for (let k = 1; k <= DEPTH; k++) zero.push(await hash2(zero[k-1], zero[k-1]));

let level = BigInt(bob.leaf);
for (let d = 0; d < DEPTH; d++) {
  level = await hash2(level, zero[d]);
}
const newRoot = level;
const newRootHex = newRoot.toString(16).padStart(64, '0');
console.log('new asp_root (decimal):', newRoot.toString());
console.log('new asp_root (hex):    ', newRootHex);
fs.writeFileSync('asp-root-revoked.json', JSON.stringify({
  asp_root_dec: newRoot.toString(),
  asp_root_hex: newRootHex,
  bob_leaf: bob.leaf,
}, null, 2));
