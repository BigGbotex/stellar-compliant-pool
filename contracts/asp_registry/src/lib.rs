#![no_std]
//! ASP Registry — Association Set Provider allow-list root.
//!
//! Holds a single Merkle root committing to the set of identity leaves the
//! compliance authority currently considers "clean" (KYC'd, not on a
//! sanctions list, etc). The authority rebuilds the allow-list tree off-chain
//! whenever membership changes and publishes the new root here. The
//! CompliantPool contract cross-calls `get_root` on every withdrawal and
//! requires the withdrawal proof's `asp_root` public input to match exactly,
//! which means a withdrawer who was *removed* from the allow-list after
//! depositing can no longer produce a valid proof against the live root.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, symbol_short, Address, BytesN, Env,
    Symbol,
};

#[contract]
pub struct AspRegistry;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AspError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
}

#[contractevent(topics = ["asp_root_updated"], data_format = "single-value")]
pub struct RootUpdatedEvent<'a> {
    pub root: &'a BytesN<32>,
}

fn key_admin() -> Symbol {
    symbol_short!("admin")
}
fn key_root() -> Symbol {
    symbol_short!("root")
}

#[contractimpl]
impl AspRegistry {
    /// Deploy with the compliance authority's address as admin and an initial
    /// allow-list root (can be the root of an empty/seed tree).
    pub fn __constructor(
        env: Env,
        admin: Address,
        initial_root: BytesN<32>,
    ) -> Result<(), AspError> {
        if env.storage().instance().has(&key_admin()) {
            return Err(AspError::AlreadyInitialized);
        }
        env.storage().instance().set(&key_admin(), &admin);
        env.storage().instance().set(&key_root(), &initial_root);
        RootUpdatedEvent {
            root: &initial_root,
        }
        .publish(&env);
        Ok(())
    }

    /// Publish a new allow-list root. Only the compliance authority can call
    /// this — invoke whenever the ASP allow-list changes (member added,
    /// removed, or flagged as a bad actor and dropped from the set).
    pub fn set_root(env: Env, root: BytesN<32>) -> Result<(), AspError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&key_admin())
            .ok_or(AspError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&key_root(), &root);
        RootUpdatedEvent { root: &root }.publish(&env);
        Ok(())
    }

    /// Current allow-list Merkle root. Cross-called by CompliantPool on every
    /// withdrawal to enforce freshness.
    pub fn get_root(env: Env) -> Result<BytesN<32>, AspError> {
        env.storage()
            .instance()
            .get(&key_root())
            .ok_or(AspError::NotInitialized)
    }

    pub fn admin(env: Env) -> Result<Address, AspError> {
        env.storage()
            .instance()
            .get(&key_admin())
            .ok_or(AspError::NotInitialized)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn deploy_set_and_get_root() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let seed_root = BytesN::from_array(&env, &[0u8; 32]);

        let contract_id = env.register(AspRegistry, (admin.clone(), seed_root.clone()));
        let client = AspRegistryClient::new(&env, &contract_id);

        assert_eq!(client.get_root(), seed_root);
        assert_eq!(client.admin(), admin);

        let new_root = BytesN::from_array(&env, &[7u8; 32]);
        env.mock_all_auths();
        client.set_root(&new_root);
        assert_eq!(client.get_root(), new_root);
    }
}
