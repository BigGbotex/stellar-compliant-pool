#![no_std]
#![allow(dead_code)]
extern crate alloc;
// Compliant Privacy Pool
//
// Adapted from the rs-soroban-ultrahonk "tornado_classic" mixer
// (https://github.com/yugocabrio/rs-soroban-ultrahonk, MIT licensed), which
// provides the Poseidon2 incremental Merkle tree + UltraHonk verifier wiring.
// This version adds one thing on top: every withdrawal must also prove
// membership in the current ASP (Association Set Provider) allow-list,
// enforced by cross-calling a separate `AspRegistry` contract and comparing
// its live root against the `asp_root` public input baked into the proof.
//
// Public inputs are ordered `[root, nullifier_hash, asp_root]` (3 x 32 bytes
// = 96 bytes), matching `circuits/withdraw/src/main.nr`.

use alloc::vec::Vec;
use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, crypto::BnScalar, symbol_short, Address,
    Bytes, BytesN, Env, IntoVal, InvokeError, Symbol, Val, Vec as SorobanVec, U256,
};
use ultrahonk_soroban_verifier::PROOF_BYTES;

#[contract]
pub struct CompliantPoolContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PoolError {
    CommitmentExists = 1,
    NullifierUsed = 2,
    VerificationFailed = 3,
    RootMismatch = 4,
    VerifierNotSet = 5,
    TreeFull = 6,
    RootNotSet = 7,
    AlreadyInitialized = 8,
    InvalidPublicInputs = 9,
    AspRegistryNotSet = 10,
    AspRootMismatch = 11,
    AspRegistryCallFailed = 12,
}

#[contractevent(topics = ["deposit"], data_format = "map")]
pub struct DepositEvent<'a> {
    #[topic]
    pub idx: &'a u32,
    pub commitment: &'a BytesN<32>,
}

#[contractevent(topics = ["withdraw"], data_format = "single-value")]
pub struct WithdrawEvent<'a> {
    pub nullifier_hash: &'a BytesN<32>,
}

fn key_commitment_prefix() -> Symbol {
    symbol_short!("cm")
}
fn key_nullifier_prefix() -> Symbol {
    symbol_short!("nf")
}
fn key_root() -> Symbol {
    symbol_short!("root")
}
fn key_frontier_prefix() -> Symbol {
    symbol_short!("fr")
}
fn key_next_index() -> Symbol {
    symbol_short!("idx")
}
fn key_verifier() -> Symbol {
    symbol_short!("ver")
}
fn key_asp_registry() -> Symbol {
    symbol_short!("asp")
}

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1u32 << TREE_DEPTH;

fn poseidon2_hash2(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let modulus = <BnScalar as Field>::modulus(env);
    let a_bytes = Bytes::from_array(env, &a.to_array());
    let b_bytes = Bytes::from_array(env, &b.to_array());
    let mut inputs = SorobanVec::new(env);
    inputs.push_back(U256::from_be_bytes(env, &a_bytes).rem_euclid(&modulus));
    inputs.push_back(U256::from_be_bytes(env, &b_bytes).rem_euclid(&modulus));
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    let out_bytes = out.to_be_bytes();
    let mut out_arr = [0u8; 32];
    out_bytes.copy_into_slice(&mut out_arr);
    BytesN::from_array(env, &out_arr)
}

fn zeroes_for_tree(env: &Env) -> Vec<BytesN<32>> {
    // zero[0] = 0; zero[i+1] = H(zero[i], zero[i])
    let mut zeroes = Vec::with_capacity(TREE_DEPTH as usize + 1);
    let mut cur = BytesN::from_array(env, &[0u8; 32]);
    zeroes.push(cur.clone());
    for _ in 0..TREE_DEPTH {
        cur = poseidon2_hash2(env, &cur, &cur);
        zeroes.push(cur.clone());
    }
    zeroes
}

/// Public inputs are `[root, nullifier_hash, asp_root]`, 32 bytes each.
fn parse_public_inputs(bytes: &Bytes) -> Result<([u8; 32], [u8; 32], [u8; 32]), PoolError> {
    if bytes.len() != 96 {
        return Err(PoolError::InvalidPublicInputs);
    }
    let mut buf = [0u8; 96];
    bytes.copy_into_slice(&mut buf);
    let mut root = [0u8; 32];
    root.copy_from_slice(&buf[..32]);
    let mut nullifier_hash = [0u8; 32];
    nullifier_hash.copy_from_slice(&buf[32..64]);
    let mut asp_root = [0u8; 32];
    asp_root.copy_from_slice(&buf[64..96]);
    Ok((root, nullifier_hash, asp_root))
}

fn verify_proof(
    env: &Env,
    verifier: &Address,
    public_inputs: Bytes,
    proof_bytes: Bytes,
) -> Result<(), PoolError> {
    let mut args: SorobanVec<Val> = SorobanVec::new(env);
    args.push_back(public_inputs.into_val(env));
    args.push_back(proof_bytes.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| PoolError::VerificationFailed)?
        .map_err(|_| PoolError::VerificationFailed)
}

/// Cross-call the AspRegistry contract's `get_root` and return its current
/// allow-list root, so withdrawal proofs can be checked against it live.
fn current_asp_root(env: &Env, asp_registry: &Address) -> Result<BytesN<32>, PoolError> {
    let args: SorobanVec<Val> = SorobanVec::new(env);
    let result: BytesN<32> = env
        .try_invoke_contract::<BytesN<32>, InvokeError>(
            asp_registry,
            &Symbol::new(env, "get_root"),
            args,
        )
        .map_err(|_| PoolError::AspRegistryCallFailed)?
        .map_err(|_| PoolError::AspRegistryCallFailed)?;
    Ok(result)
}

#[contractimpl]
impl CompliantPoolContract {
    /// Initialize the contract with the proof verifier and ASP registry addresses.
    pub fn __constructor(
        env: Env,
        verifier: Address,
        asp_registry: Address,
    ) -> Result<(), PoolError> {
        if env.storage().instance().has(&key_verifier()) {
            return Err(PoolError::AlreadyInitialized);
        }
        env.storage().instance().set(&key_verifier(), &verifier);
        env.storage()
            .instance()
            .set(&key_asp_registry(), &asp_registry);
        Ok(())
    }

    /// Inserts a new leaf (deposit commitment) into the Poseidon2 Merkle tree
    /// and returns its index. Token custody is intentionally out of scope
    /// here (see README) — wire in a `token_client.transfer(...)` call before
    /// this line in a production version.
    pub fn deposit(env: Env, commitment: BytesN<32>) -> Result<u32, PoolError> {
        let cm_key = (key_commitment_prefix(), commitment.clone());
        if env.storage().instance().has(&cm_key) {
            return Err(PoolError::CommitmentExists);
        }
        let zeroes = zeroes_for_tree(&env);
        let mut next_index: u32 = env
            .storage()
            .instance()
            .get(&key_next_index())
            .unwrap_or(0u32);
        if next_index >= MAX_LEAVES {
            return Err(PoolError::TreeFull);
        }
        let idx = next_index;
        env.storage().instance().set(&cm_key, &true);
        DepositEvent {
            idx: &idx,
            commitment: &commitment,
        }
        .publish(&env);

        let ins_idx = next_index;
        let mut cur = commitment.clone();
        let mut i = 0u32;
        while i < TREE_DEPTH {
            let bit = (ins_idx >> i) & 1;
            if bit == 0 {
                let fk = (key_frontier_prefix(), i);
                env.storage().instance().set(&fk, &cur);
                let z = &zeroes[i as usize];
                cur = poseidon2_hash2(&env, &cur, z);
            } else {
                let fk = (key_frontier_prefix(), i);
                let left: BytesN<32> = env
                    .storage()
                    .instance()
                    .get(&fk)
                    .unwrap_or_else(|| zeroes[i as usize].clone());
                cur = poseidon2_hash2(&env, &left, &cur);
            }
            i += 1;
        }
        env.storage().instance().set(&key_root(), &cur);
        next_index = next_index.saturating_add(1);
        env.storage().instance().set(&key_next_index(), &next_index);

        Ok(idx)
    }

    /// Verifies a withdrawal proof and pays out, gated on three checks:
    /// (1) the pool Merkle root the proof was built against is the current
    /// root, (2) the nullifier hasn't been spent, and (3) the `asp_root`
    /// baked into the proof matches the AspRegistry's *live* root — so a
    /// withdrawer who has since been removed from the allow-list cannot
    /// produce a proof that passes, even if their deposit is old.
    pub fn withdraw(env: Env, public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), PoolError> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(PoolError::VerificationFailed);
        }
        let (root_arr, nf_arr, asp_root_arr) = parse_public_inputs(&public_inputs)?;
        let nf_from_proof = BytesN::from_array(&env, &nf_arr);

        let nf_key = (key_nullifier_prefix(), nf_from_proof.clone());
        if env.storage().instance().has(&nf_key) {
            return Err(PoolError::NullifierUsed);
        }

        let root_from_proof = BytesN::from_array(&env, &root_arr);
        let stored_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&key_root())
            .ok_or(PoolError::RootNotSet)?;
        if stored_root != root_from_proof {
            return Err(PoolError::RootMismatch);
        }

        // --- Compliance check: proof's asp_root must equal the live ASP root ---
        let asp_registry: Address = env
            .storage()
            .instance()
            .get(&key_asp_registry())
            .ok_or(PoolError::AspRegistryNotSet)?;
        let asp_root_from_proof = BytesN::from_array(&env, &asp_root_arr);
        let live_asp_root = current_asp_root(&env, &asp_registry)?;
        if asp_root_from_proof != live_asp_root {
            return Err(PoolError::AspRootMismatch);
        }

        let verifier: Address = env
            .storage()
            .instance()
            .get(&key_verifier())
            .ok_or(PoolError::VerifierNotSet)?;
        verify_proof(&env, &verifier, public_inputs, proof_bytes)?;

        env.storage().instance().set(&nf_key, &true);
        WithdrawEvent {
            nullifier_hash: &nf_from_proof,
        }
        .publish(&env);
        Ok(())
    }

    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        let nf_key = (key_nullifier_prefix(), nullifier_hash);
        env.storage().instance().has(&nf_key)
    }

    pub fn get_root(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&key_root())
    }

    pub fn asp_registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&key_asp_registry())
    }
}

// Note: no test-only "set_root" backdoor here on purpose. Tests should call
// the real `deposit()` to populate the tree and obtain a real root, the same
// way the reference rs-soroban-ultrahonk mixer's own test suite does -
// exercising the actual code path is more trustworthy than a shortcut I
// couldn't verify compiles correctly in this sandbox anyway (see README).
