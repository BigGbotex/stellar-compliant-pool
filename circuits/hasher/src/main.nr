// Tiny utility circuit: exposes the exact hash2(a, b) used by withdraw/src/main.nr
// and by the on-chain contracts (via soroban-poseidon). Off-chain scripts execute
// THIS circuit to compute leaves/roots/paths rather than re-implementing Poseidon2
// independently in JS - that guarantees the off-chain tree matches the on-chain one
// and the circuit, since all three are driven by the same Poseidon2 instantiation.
use dep::poseidon::poseidon2::Poseidon2;

fn main(a: Field, b: Field) -> pub Field {
    Poseidon2::hash([a, b], 2)
}
