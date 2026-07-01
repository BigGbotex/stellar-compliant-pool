# Off-chain scripts

Both scripts route every hash through `circuits/hasher` (via `@noir-lang/noir_wasm`
+ `noir_js`) rather than reimplementing Poseidon2 in JS - see `lib/hasher.mjs`.
This guarantees the off-chain tree always matches what the circuit and the
on-chain `soroban-poseidon` host function compute, by construction.

## Setup

```bash
npm install
```

## generate-note.mjs

Creates a fresh deposit note.

```bash
node generate-note.mjs
```

Outputs `{ nullifier, secret, commitment, nullifier_hash }`. Keep `nullifier`
and `secret` private - send only `commitment` to `CompliantPoolContract.deposit()`.

## build-withdraw-witness.mjs

Builds the full witness (both Merkle paths) for `circuits/withdraw`, given the
public leaf lists and your private note + identity secret.

```bash
node build-withdraw-witness.mjs config.json [outDir]
```

`config.json`:
```json
{
  "poolCommitments": ["<leaf0>", "<leaf1>", "..."],
  "withdrawIndex": 0,
  "nullifier": "...",
  "secret": "...",
  "aspLeaves": ["<leaf0>", "<leaf1>", "..."],
  "aspIndex": 0,
  "identitySecret": "..."
}
```

- `poolCommitments`: every commitment currently in the pool, in deposit order.
  Read these from `CompliantPoolContract` `DepositEvent` history on-chain.
- `aspLeaves`: every leaf hash in the current ASP allow-list, in registration
  order. These are public (the compliance authority publishes them alongside
  the root they set on `AspRegistry`) - never share raw `identitySecret`
  values for anyone but yourself.

Writes `witness.json` (for `noir_js`-based flows) and `Prover.toml` (for the
`nargo` CLI) into `outDir` (defaults to the config file's directory), and
prints the public inputs (`root`, `nullifier_hash`, `asp_root`) your on-chain
`withdraw()` call needs to match.

Next step after this script: copy `Prover.toml` into `circuits/withdraw/`,
then `nargo execute` and `bb prove` (see the top-level README's Setup section
for exact versions/flags).
