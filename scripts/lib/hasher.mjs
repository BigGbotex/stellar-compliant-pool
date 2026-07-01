// Wraps circuits/hasher so every off-chain script computes hash2(a, b) by
// actually executing the same Poseidon2 instantiation the withdraw circuit
// and the on-chain contracts use - never re-implemented independently in JS.
// This is the #1 risk area in this whole design (see README "Known risks");
// routing every hash through the real circuit removes it by construction.
import { compile, createFileManager } from '@noir-lang/noir_wasm';
import { Noir } from '@noir-lang/noir_js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HASHER_PATH = path.join(__dirname, '..', '..', 'circuits', 'hasher');

let noirInstance = null;
const cache = new Map();

async function getNoir() {
  if (!noirInstance) {
    const fm = createFileManager(HASHER_PATH);
    const { program } = await compile(fm);
    noirInstance = new Noir(program);
  }
  return noirInstance;
}

/** hash2(a, b) -> BigInt, matching Poseidon2::hash([a, b], 2) in the circuits. */
export async function hash2(a, b) {
  const key = `${a},${b}`;
  if (cache.has(key)) return cache.get(key);
  const noir = await getNoir();
  const { returnValue } = await noir.execute({ a: a.toString(), b: b.toString() });
  const v = BigInt(returnValue);
  cache.set(key, v);
  return v;
}
