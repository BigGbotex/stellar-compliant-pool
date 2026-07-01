# Contracts

`asp_registry` and `compliant_pool` are Soroban contracts. **Not compiled in
the sandbox these were written in** - see the top-level README's "Status:
honest summary" for exactly why (old system Rust, no path to a newer
toolchain in that environment). Run these first on your machine:

```bash
rustup target add wasm32-unknown-unknown
cd contracts
cargo check --workspace
cargo build --target wasm32-unknown-unknown --release
cargo test --workspace
```

`compliant_pool`'s `Cargo.toml` pulls `ultrahonk_soroban_verifier` straight
from [rs-soroban-ultrahonk](https://github.com/yugocabrio/rs-soroban-ultrahonk)
via a git dependency - no need to vendor it yourself.

## Deploying (sketch)

```bash
stellar contract build
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/asp_registry.wasm \
  --network testnet -- --admin <YOUR_ADDR> --initial_root <SEED_ROOT>
stellar contract deploy --wasm <verifier wasm from rs-soroban-ultrahonk> --network testnet
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/compliant_pool.wasm \
  --network testnet -- --verifier <VERIFIER_ID> --asp_registry <ASP_REGISTRY_ID>
```

Exact verifying-key wiring for the verifier contract depends on
`circuits/withdraw`'s compiled artifact - follow rs-soroban-ultrahonk's own
deployment docs for that step, since it's unchanged from their setup.
