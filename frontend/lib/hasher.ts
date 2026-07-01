// Runs server-side only (inside Next.js API routes). Computes hash2(a, b) by
// executing the same circuits/hasher project used by scripts/lib/hasher.mjs and
// validated against circuits/withdraw - never reimplemented independently.
import { compile, createFileManager } from "@noir-lang/noir_wasm";
import { Noir } from "@noir-lang/noir_js";
import path from "path";

const HASHER_PATH = path.join(process.cwd(), "..", "circuits", "hasher");

let noirInstance: Noir | null = null;
const cache = new Map<string, bigint>();

async function getNoir(): Promise<Noir> {
  if (!noirInstance) {
    const fm = createFileManager(HASHER_PATH);
    const { program } = await compile(fm);
    noirInstance = new Noir(program);
  }
  return noirInstance;
}

export async function hash2(a: bigint, b: bigint): Promise<bigint> {
  const key = `${a},${b}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const noir = await getNoir();
  const { returnValue } = await noir.execute({ a: a.toString(), b: b.toString() });
  const v = BigInt(returnValue as string);
  cache.set(key, v);
  return v;
}
