## Status: fully verified end-to-end

Everything below was confirmed working on a real Mac M2:

- circuits/withdraw and circuits/hasher compile with nargo 1.0.0-beta.9
- Real UltraHonk proof generated with bb v0.87.0 and verified locally
- Both Soroban contracts compiled to .wasm with rustc 1.96 / wasm32v1-none
- All three contracts deployed to Stellar testnet
- Real withdrawal proof verified on-chain by the deployed verifier contract

Deployed contracts (Stellar testnet):
- Verifier:       CCHV752572EPOJS6RZAVIGYNLTWEP2IIP75BBJPD764AW534RNBE5D5E
- ASP Registry:   CB2AYIWHTOY6NNXF6DCC3MQIL7OJ563BMDFMYWVJFCKQMKHW3UZJMX64
- Compliant Pool: CCO3OP4KH7VU7C2NKOG7G3OKRRI4A7SPISSWVDALE4VBM7DDWABA4KQB

Proof verified on-chain:
https://stellar.expert/explorer/testnet/tx/5b438dcd9d763278fc989eb5630287ba433da5793b4d912db4e9efc9a2d2db86
# Compliant Privacy Pool (Stellar + Noir + Soroban)

Built for the "Real-World ZK on Stellar" hackathon. A privacy pool where deposits and
withdrawals are unlinkable on-chain, but every withdrawal still has to prove the
withdrawer is on the current ASP (Association Set Provider) allow-list - the
"compliant privacy" pattern the hackathon brief specifically calls out. Remove
someone from the allow-list and their next withdrawal proof simply won't satisfy
the circuit anymore, no matter how old or valid their original deposit is.

ZK does the actual work here: a Noir circuit proves (a) you own a real, unspent
deposit in the pool's Merkle tree, and (b) you hold an identity secret included in
the *current* ASP allow-list tree - all without revealing which deposit or which
identity. The proof verifies on Stellar via the UltraHonk verifier contract from
Stellar's official hackathon resources, using the Protocol 25/26 BN254 + Poseidon2
host functions.

## Status: honest summary

This was built and tested end-to-end in a sandboxed environment with real
constraints (old system Rust, no `rustup`, restricted network egress). I'm
upfront below about exactly what got verified for real versus what needs your
local toolchain to confirm. Nothing here is faked or hand-waved - where I
couldn't verify something, I say so and explain why.

**Verified for real, in this repo, against the actual files:**
- `circuits/withdraw` and `circuits/hasher` compile cleanly with `@noir-lang/noir_wasm` /
  `@noir-lang/noir_js` pinned at `1.0.0-beta.9` and `poseidon` pinned at `v0.2.0`
  (the same pairing the reference verifier repo uses, see "Hash function
  versioning" below).
- The withdraw circuit's constraint logic is correct: I executed it with a real,
  internally-consistent witness (3 pool deposits, 2 ASP identities, withdrawing a
  non-first entry of each) and confirmed it succeeds, then ran four adversarial
  variants (wrong nullifier_hash, tampered pool Merkle sibling, identity not in
  the ASP set, stale asp_root) and confirmed all four correctly fail.
- `scripts/` and `frontend/` are fully working, not stubs. I ran the actual HTTP
  flow against the running Next.js server: generate a note -> deposit -> add two
  ASP identities -> build a withdrawal witness (succeeds) -> revoke the
  withdrawer's identity -> build the same withdrawal again (correctly rejected
  with "this identity was revoked"). The resulting witness from that live run
  was then independently re-executed against the circuit and satisfied it.
- The Next.js frontend builds (`npm run build`) and runs (`npm start`) cleanly.

**Written carefully, but NOT compiled/tested in this sandbox - verify locally:**
- `contracts/asp_registry` and `contracts/compliant_pool` (Soroban/Rust). The
  sandbox's Rust toolchain is 1.75.0 with no `rustup` and no network access to
  install a newer one. Current `soroban-sdk` (26.x) pulls in dependencies that
  require Rust 1.85+ (edition2024), so `cargo check` could not be run here at
  all - confirmed by testing `soroban-sdk` alone, isolated from everything else,
  and hitting the same wall. `compliant_pool` is a direct extension of the
  official, repo-tested `tornado_classic` mixer contract from
  [rs-soroban-ultrahonk](https://github.com/yugocabrio/rs-soroban-ultrahonk) (MIT) -
  I kept its structure and storage patterns unchanged and added the ASP
  cross-check on top, but **run `cargo check` and `cargo build --target
  wasm32-unknown-unknown` yourself before trusting it**, and treat any errors
  there as the immediate next thing to fix, not a sign anything deeper is wrong.
- Real proof generation (`bb prove`). I got real UltraHonk proofs generating and
  verifying via `@aztec/bb.js` against an *older* poseidon/compiler pairing
  during development, but hit an ACIR-format version mismatch (`Circuit::
  current_witness_index`) between the latest `@aztec/bb.js` and `@noir-lang/
  noir_wasm` npm releases when I pinned to the versions this repo actually
  ships with. This is a known category of issue in the Noir ecosystem - the JS
  packages and the native CLIs aren't always in lockstep. **Use the native
  `nargo` + `bb` CLI tools** (see Setup below) rather than the JS packages for
  proving; that's the better-supported path anyway and is what the reference
  repo documents.

## Architecture

```
deposit:  user -> CompliantPoolContract.deposit(commitment)
                   commitment = Poseidon2(nullifier, secret)
                   -> appended to a depth-20 incremental Merkle tree on-chain

withdraw: user -> generates a Noir proof (off-chain) showing:
                   1. commitment is a real leaf in the pool tree (root matches on-chain)
                   2. nullifier_hash = Poseidon2(nullifier, 0)   [prevents double-spend]
                   3. identity_secret's leaf is in the CURRENT AspRegistry tree (asp_root)
                 -> CompliantPoolContract.withdraw(public_inputs, proof_bytes)
                   - checks root matches current pool root
                   - checks nullifier_hash unused
                   - cross-calls AspRegistry.get_root() and requires it == proof's asp_root
                   - cross-calls the UltraHonkVerifier contract to check the proof itself
                   - pays out
```

```
circuits/
  withdraw/   the proof circuit (pool membership + nullifier + ASP membership)
  hasher/     tiny hash2(a,b) circuit; used by off-chain scripts as the hash "oracle"
              so the tree-builder never reimplements Poseidon2 independently
contracts/
  asp_registry/    compliance authority publishes the allow-list Merkle root
  compliant_pool/  deposit tree + withdrawal verification + ASP cross-check
scripts/           Node tooling: generate a deposit note, build a withdrawal witness
frontend/          Next.js app: deposit / ASP admin / withdraw, backed by the same
                   hashing logic as scripts/ (via API routes, since those run in Node)
```

## What's intentionally simplified (said here, not hidden)

- **`identity_secret` isn't bound to the deposit.** The circuit proves "the
  withdrawer holds *some* ASP-approved identity," not "the *original depositor*
  holds one." That's enough to block a flagged actor from withdrawing, but a
  production version should bind identity into the commitment itself so one
  allow-listed identity can't be reused to unlock unrelated deposits. Flagged in
  the circuit's own comments too.
- **No real token custody.** `deposit()` takes a commitment and doesn't move any
  asset; wire in a real token client `transfer()` call before this is anything
  more than a demo. Noted inline in `compliant_pool/src/lib.rs`.
- **ASP "revocation" is a tree-shape simplification.** Revoking an identity
  replaces its leaf with a sentinel value rather than a real indexed
  nullifier/versioning scheme. Good enough to demonstrate the property (a
  revoked identity can no longer produce a valid proof), not production-grade
  list management.
- **The frontend's pool/ASP state is in-memory**, not read from chain. A real
  version reads `DepositEvent` history and the live `AspRegistry` contract
  instead of an in-process array. Swapping this is the main integration work
  left to actually go on testnet.

## Hash function versioning (read this before changing dependency versions)

The circuits use `Poseidon2::hash` from `noir-lang/poseidon`, pinned at `v0.2.0` -
the same version the reference verifier repo uses, which is the version whose
output has actually been checked against the on-chain `soroban-poseidon`
Poseidon2 host function (that's the entire reason proof verification on Stellar
works at all). I confirmed `v0.2.0` fails to compile under newer Noir compiler
releases (I hit this with `noir_wasm@1.0.0-beta.22`) - if you hit the same
thing, install `nargo` and `bb` at the exact versions below rather than
reaching for `v0.3.0`+ of the poseidon library, unless you first re-verify that
its hash output still matches `soroban-poseidon`.

## Setup

**Circuits (proving):**
```bash
noirup --version 1.0.0-beta.9      # https://noir-lang.org
bbup --version 0.87.0              # Barretenberg CLI
cd circuits/withdraw && nargo check
```

**Contracts:**
```bash
rustup target add wasm32-unknown-unknown
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # if you don't have rustup
cd contracts
cargo check --workspace
cargo build --target wasm32-unknown-unknown --release
```

**Off-chain scripts:**
```bash
cd scripts && npm install
node generate-note.mjs > note.json
# ... deposit note.commitment via your deployed CompliantPoolContract, then:
node build-withdraw-witness.mjs config.json   # see scripts/README.md for config.json shape
cd ../circuits/withdraw
cp /path/to/Prover.toml .
nargo execute
bb prove --scheme ultra_honk --oracle_hash keccak -b target/withdraw.json -w target/withdraw.gz -o target/proof
```

**Frontend (deposit/withdraw demo UI, backed by real Poseidon2 hashing):**
```bash
cd frontend
npm install
npm run build && npm start    # or: npm run dev
# open http://localhost:3000
```

## Demo flow (what the video shows)

1. Generate a note, deposit it into the pool.
2. Add two identities to the ASP allow-list (this is the compliance authority's
   side - in production they'd be issuing `identity_secret` after real KYC).
3. Build the withdrawal proof inputs for the first identity - succeeds, shows
   the public inputs (`root`, `nullifier_hash`, `asp_root`) that get checked
   on-chain.
4. Revoke that identity from the allow-list.
5. Try to build the same withdrawal again - the app explains exactly why it's
   rejected: the identity was revoked, so no valid proof can be produced for it
   against the live ASP root, even though the deposit itself is still perfectly
   valid.

## Attribution

`contracts/compliant_pool` extends the MIT-licensed `tornado_classic` mixer
contract and circuit from
[rs-soroban-ultrahonk](https://github.com/yugocabrio/rs-soroban-ultrahonk),
which Stellar points hackathon teams to as the ready-to-clone UltraHonk
verifier for Soroban. The verifier contract itself, and the Poseidon2
incremental tree pattern, are theirs; the ASP allow-list layer on top is new.

## Next steps / stretch goals

- Bind `identity_secret` into the deposit commitment (closes the simplification above).
- Real token transfer in `deposit`/`withdraw`.
- Read pool/ASP state from chain instead of the in-memory demo store.
- Wrap the withdraw step in a mocked fiat off-ramp UI to demo the "private
  cross-border remittance corridor" framing with the same circuit underneath.
- Recursive/aggregated proofs if multiple withdrawals need to batch.
