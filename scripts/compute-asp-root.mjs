import fs from 'fs';
import { hash2 } from './lib/hasher.mjs';

const alice = JSON.parse(fs.readFileSync('identity-alice.json', 'utf8'));
const bob   = JSON.parse(fs.readFileSync('identity-bob.json',   'utf8'));

// ASP tree depth 8, same zero-padding as the withdraw circuit
const DEPTH = 8;
const zero = [0n];
for (let k = 1; k <= DEPTH; k++) zero.push(await hash2(zero[k-1], zero[k-1]));

// Two leaves: alice at index 0, bob at index 1
const leaves = [BigInt(alice.leaf), BigInt(bob.leaf)];

// Level 0 -> 1: hash(alice_leaf, bob_leaf)
let level = [await hash2(leaves[0], leaves[1])];
// Levels 1..8: keep hashing with zero siblings
for (let d = 1; d < DEPTH; d++) {
  level = [await hash2(level[0], zero[d])];
}
const asp_root = level[0];
const asp_root_hex = asp_root.toString(16).padStart(64, '0');
console.error('asp_root (decimal):', asp_root.toString());
console.error('asp_root (hex):    ', asp_root_hex);
fs.writeFileSync('asp-root.json', JSON.stringify({
  asp_root_dec: asp_root.toString(),
  asp_root_hex,
  alice_leaf: alice.leaf,
  bob_leaf: bob.leaf,
}, null, 2));
console.error('Wrote asp-root.json');
