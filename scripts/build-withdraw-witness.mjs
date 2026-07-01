// Builds the witness for circuits/withdraw given:
//  - the full list of pool commitments (public - read from CompliantPoolContract
//    DepositEvent history, or from a local file for testnet/demo purposes)
//  - the full list of ASP allow-list leaf hashes (public - published by the
//    compliance authority alongside the root it sets on AspRegistry; NOT the
//    raw identity secrets, which stay private to each allow-listed user)
//  - the withdrawer's own private (nullifier, secret) and identity_secret,
//    plus which index in each list is theirs.
//
// Usage:
//   node build-withdraw-witness.mjs <config.json> [outDir]
//
// config.json shape:
// {
//   "poolCommitments": ["123...", "456...", ...],   // index order = deposit order
//   "withdrawIndex": 1,
//   "nullifier": "111",
//   "secret": "222",
//   "aspLeaves": ["987...", "654...", ...],          // index order = ASP registration order
//   "aspIndex": 1,
//   "identitySecret": "999"
// }
//
// Writes <outDir>/witness.json (for noir_js .execute()/proving flows) and
// <outDir>/Prover.toml (for the `nargo` CLI / `bb prove` flow).
import fs from 'fs';
import path from 'path';
import { hash2 } from './lib/hasher.mjs';
import { buildZero, buildLevels, pathFor } from './lib/merkle.mjs';

const TREE_DEPTH = 20;
const ASP_DEPTH = 8;

const [, , configPath, outDirArg] = process.argv;
if (!configPath) {
  console.error('Usage: node build-withdraw-witness.mjs <config.json> [outDir]');
  process.exit(1);
}
const outDir = outDirArg || path.dirname(configPath);
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const poolLeaves = cfg.poolCommitments.map(BigInt);
const aspLeaves = cfg.aspLeaves.map(BigInt);
const nullifier = BigInt(cfg.nullifier);
const secret = BigInt(cfg.secret);
const identitySecret = BigInt(cfg.identitySecret);

// Sanity check: the claimed leaf at withdrawIndex must actually equal hash2(nullifier, secret).
const expectedLeaf = await hash2(nullifier, secret);
if (poolLeaves[cfg.withdrawIndex] !== expectedLeaf) {
  console.error(
    `poolCommitments[${cfg.withdrawIndex}] does not equal hash2(nullifier, secret). ` +
    `Got ${poolLeaves[cfg.withdrawIndex]}, expected ${expectedLeaf}. Check withdrawIndex.`
  );
  process.exit(1);
}
const expectedAspLeaf = await hash2(identitySecret, 0n);
if (aspLeaves[cfg.aspIndex] !== expectedAspLeaf) {
  console.error(
    `aspLeaves[${cfg.aspIndex}] does not equal hash2(identitySecret, 0). ` +
    `Got ${aspLeaves[cfg.aspIndex]}, expected ${expectedAspLeaf}. Check aspIndex / identitySecret.`
  );
  process.exit(1);
}

console.error('Building zero chain...');
const zero = await buildZero(TREE_DEPTH);

console.error(`Building pool tree (${poolLeaves.length} leaves)...`);
const poolLevels = await buildLevels(poolLeaves, zero, TREE_DEPTH);
const { siblings: path_siblings, bits: path_bits, root } = pathFor(poolLevels, zero, TREE_DEPTH, cfg.withdrawIndex);

console.error(`Building ASP tree (${aspLeaves.length} leaves)...`);
const aspLevels = await buildLevels(aspLeaves, zero, ASP_DEPTH);
const { siblings: asp_path_siblings, bits: asp_path_bits, root: asp_root } =
  pathFor(aspLevels, zero, ASP_DEPTH, cfg.aspIndex);

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

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'witness.json'), JSON.stringify(witness, null, 2));

function toToml(w) {
  const arr = (xs) => `[${xs.map((x) => `"${x}"`).join(', ')}]`;
  return [
    `root = "${w.root}"`,
    `nullifier_hash = "${w.nullifier_hash}"`,
    `asp_root = "${w.asp_root}"`,
    `nullifier = "${w.nullifier}"`,
    `secret = "${w.secret}"`,
    `path_siblings = ${arr(w.path_siblings)}`,
    `path_bits = ${arr(w.path_bits)}`,
    `identity_secret = "${w.identity_secret}"`,
    `asp_path_siblings = ${arr(w.asp_path_siblings)}`,
    `asp_path_bits = ${arr(w.asp_path_bits)}`,
    '',
  ].join('\n');
}
fs.writeFileSync(path.join(outDir, 'Prover.toml'), toToml(witness));

console.error(`\nWrote ${path.join(outDir, 'witness.json')} and Prover.toml`);
console.error('\nPublic inputs your withdraw() call must match on-chain:');
console.error('  root          =', root.toString(), ' (must equal CompliantPoolContract.get_root())');
console.error('  nullifier_hash=', nullifier_hash.toString());
console.error('  asp_root      =', asp_root.toString(), ' (must equal AspRegistry.get_root() at call time)');
console.error('\nNext step: copy Prover.toml into circuits/withdraw/, then:');
console.error('  cd circuits/withdraw && nargo execute && bb prove --scheme ultra_honk --oracle_hash keccak ...');
console.error('(see scripts/README.md and the top-level README "Generating a real proof" section)');
