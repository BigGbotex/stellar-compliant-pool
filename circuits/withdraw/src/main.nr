// Compliant Privacy Pool - withdraw circuit
//
// This is the rs-soroban-ultrahonk "tornado_classic" circuit
// (https://github.com/yugocabrio/rs-soroban-ultrahonk/blob/main/circuits/tornado/src/main.nr),
// extended with a second Merkle branch that proves the withdrawer holds an
// identity secret included in the current ASP (Association Set Provider)
// allow-list, without revealing which entry.
//
// Private inputs:
//   - nullifier, secret                -> derive the pool commitment + nullifier hash
//   - path_siblings, path_bits         -> Merkle path of the commitment into the pool tree (depth 20)
//   - identity_secret                  -> the user's ASP-issued secret (proves "I am allow-listed")
//   - asp_path_siblings, asp_path_bits -> Merkle path of the identity leaf into the ASP tree (depth 8)
//
// Public inputs:
//   - root           -> current pool Merkle root (must match the on-chain frontier root)
//   - nullifier_hash -> prevents double-spend; checked against on-chain spent-set
//   - asp_root       -> current ASP allow-list root; pool contract cross-checks this against
//                       the live AspRegistry contract before accepting the withdrawal
//
// Hash function: Poseidon2 (matches the Poseidon2 host-function path used on-chain via
// soroban-poseidon, so the same hash2 pattern must be mirrored in the Soroban contracts).
//
// Known simplification (documented in README): identity_secret is not cryptographically
// bound to the specific deposit's nullifier/secret. This proves "the withdrawer holds an
// ASP-approved identity," which is what excludes flagged actors from withdrawing, but a
// production version would bind identity_secret into the commitment itself so a single
// allow-listed identity can't be reused to unlock multiple unrelated deposits anonymously.

use dep::poseidon::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 20;
global ASP_DEPTH: u32 = 8;

fn hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn constrain_bit(bit: Field) {
    // Enforce bit in {0,1}
    assert(bit * (1 - bit) == 0);
}

fn compute_root(leaf: Field, path_siblings: [Field; TREE_DEPTH], path_bits: [Field; TREE_DEPTH]) -> Field {
    let mut cur = leaf;
    for i in 0..TREE_DEPTH {
        let sib = path_siblings[i];
        let bit = path_bits[i];
        constrain_bit(bit);
        if bit == 0 {
            cur = hash2(cur, sib);
        } else {
            cur = hash2(sib, cur);
        }
    }
    cur
}

fn compute_asp_root(leaf: Field, path_siblings: [Field; ASP_DEPTH], path_bits: [Field; ASP_DEPTH]) -> Field {
    let mut cur = leaf;
    for i in 0..ASP_DEPTH {
        let sib = path_siblings[i];
        let bit = path_bits[i];
        constrain_bit(bit);
        if bit == 0 {
            cur = hash2(cur, sib);
        } else {
            cur = hash2(sib, cur);
        }
    }
    cur
}

pub fn main(
    root: pub Field,
    nullifier_hash: pub Field,
    asp_root: pub Field,
    nullifier: Field,
    secret: Field,
    path_siblings: [Field; TREE_DEPTH],
    path_bits: [Field; TREE_DEPTH],
    identity_secret: Field,
    asp_path_siblings: [Field; ASP_DEPTH],
    asp_path_bits: [Field; ASP_DEPTH],
) {
    // --- Pool membership: prove the commitment is a real, unspent deposit ---
    let leaf = hash2(nullifier, secret);
    let nf = hash2(nullifier, 0);
    assert(nf == nullifier_hash);

    let computed_root = compute_root(leaf, path_siblings, path_bits);
    assert(computed_root == root);

    // --- Compliance: prove the withdrawer is on the current ASP allow-list ---
    let asp_leaf = hash2(identity_secret, 0);
    let computed_asp_root = compute_asp_root(asp_leaf, asp_path_siblings, asp_path_bits);
    assert(computed_asp_root == asp_root);
}
