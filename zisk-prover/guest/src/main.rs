//! ZisK State Transition Function (STF)
//!
//! Proves correct execution of an Ethereum block by:
//! 1. Reading block witness (pre-state, transactions, header)
//! 2. Executing all transactions via revm
//! 3. Committing the post-state root

#![no_main]
ziskos::entrypoint!(main);

use alloy_primitives::{Address, U256};
use revm::{
    db::{CacheDB, EmptyDB},
    primitives::{AccountInfo, Bytecode, ExecutionResult, TransactTo},
    Evm,
};
use serde::{Deserialize, Serialize};

extern crate alloc;
use alloc::vec::Vec;

/// Block witness containing all data needed to prove state transition
#[derive(Serialize, Deserialize)]
struct BlockWitness {
    /// Block number
    block_number: u64,
    /// Block timestamp
    timestamp: u64,
    /// Block gas limit
    gas_limit: u64,
    /// Base fee per gas
    base_fee: u64,
    /// Coinbase (sequencer) address
    coinbase: [u8; 20],
    /// Previous block hash
    prev_block_hash: [u8; 32],
    /// Pre-state accounts
    accounts: Vec<AccountWitness>,
    /// Transactions to execute
    transactions: Vec<TxWitness>,
}

/// Account state witness
#[derive(Serialize, Deserialize)]
struct AccountWitness {
    address: [u8; 20],
    nonce: u64,
    balance: [u8; 32], // U256 as bytes
    code: Vec<u8>,
    storage: Vec<StorageSlot>,
}

/// Storage slot
#[derive(Serialize, Deserialize)]
struct StorageSlot {
    key: [u8; 32],
    value: [u8; 32],
}

/// Transaction witness
#[derive(Serialize, Deserialize)]
struct TxWitness {
    /// Sender address (pre-verified or to be verified)
    from: [u8; 20],
    /// Recipient (None for contract creation)
    to: Option<[u8; 20]>,
    /// Value in wei
    value: [u8; 32],
    /// Input data
    input: Vec<u8>,
    /// Gas limit
    gas_limit: u64,
    /// Gas price or max fee
    gas_price: u64,
    /// Nonce
    nonce: u64,
}

/// Output committed to the proof
#[derive(Serialize, Deserialize)]
struct ProofOutput {
    /// Block number proven
    block_number: u64,
    /// Pre-state root (computed from witness)
    pre_state_root: [u8; 32],
    /// Post-state root (after execution)
    post_state_root: [u8; 32],
    /// Total gas used
    gas_used: u64,
    /// Number of transactions executed
    tx_count: u64,
}

fn main() {
    // Read witness from prover input
    let input = ziskos::read_input_slice();
    let witness: BlockWitness = bincode::deserialize(&input)
        .expect("failed to decode witness");

    // Build pre-state database
    let mut db = CacheDB::new(EmptyDB::default());

    for account in &witness.accounts {
        let address = Address::from_slice(&account.address);
        let balance = U256::from_be_slice(&account.balance);

        let info = AccountInfo {
            balance,
            nonce: account.nonce,
            code_hash: if account.code.is_empty() {
                revm::primitives::KECCAK_EMPTY
            } else {
                revm::primitives::keccak256(&account.code)
            },
            code: if account.code.is_empty() {
                None
            } else {
                Some(Bytecode::new_raw(account.code.clone().into()))
            },
        };

        db.insert_account_info(address, info);

        // Insert storage
        for slot in &account.storage {
            let key = U256::from_be_slice(&slot.key);
            let value = U256::from_be_slice(&slot.value);
            db.insert_account_storage(address, key, value).unwrap();
        }
    }

    // Compute pre-state root (simplified - just hash accounts)
    let pre_state_root = compute_state_root(&witness.accounts);

    // Execute transactions
    let mut total_gas_used = 0u64;
    let coinbase = Address::from_slice(&witness.coinbase);

    for tx in &witness.transactions {
        let mut evm = Evm::builder()
            .with_db(&mut db)
            .modify_block_env(|block| {
                block.number = U256::from(witness.block_number);
                block.timestamp = U256::from(witness.timestamp);
                block.gas_limit = U256::from(witness.gas_limit);
                block.basefee = U256::from(witness.base_fee);
                block.coinbase = coinbase;
            })
            .modify_tx_env(|tx_env| {
                tx_env.caller = Address::from_slice(&tx.from);
                tx_env.transact_to = match &tx.to {
                    Some(to) => TransactTo::Call(Address::from_slice(to)),
                    None => TransactTo::Create,
                };
                tx_env.value = U256::from_be_slice(&tx.value);
                tx_env.data = tx.input.clone().into();
                tx_env.gas_limit = tx.gas_limit;
                tx_env.gas_price = U256::from(tx.gas_price);
                tx_env.nonce = Some(tx.nonce);
            })
            .build();

        let result = evm.transact_commit().expect("tx execution failed");

        match result {
            ExecutionResult::Success { gas_used, .. } => {
                total_gas_used += gas_used;
            }
            ExecutionResult::Revert { gas_used, .. } => {
                total_gas_used += gas_used;
            }
            ExecutionResult::Halt { gas_used, .. } => {
                total_gas_used += gas_used;
            }
        }
    }

    // Compute post-state root from modified db
    let post_state_root = compute_db_state_root(&db);

    // Commit proof output
    let output = ProofOutput {
        block_number: witness.block_number,
        pre_state_root,
        post_state_root,
        gas_used: total_gas_used,
        tx_count: witness.transactions.len() as u64,
    };

    let output_bytes = bincode::serialize(&output)
        .expect("failed to encode output");

    // Write output as 32-bit chunks
    for (i, chunk) in output_bytes.chunks(4).enumerate() {
        let mut arr = [0u8; 4];
        arr[..chunk.len()].copy_from_slice(chunk);
        ziskos::set_output(i, u32::from_le_bytes(arr));
    }
}

/// Compute state root from account witnesses (simplified hash)
fn compute_state_root(accounts: &[AccountWitness]) -> [u8; 32] {
    use sha3::{Digest, Keccak256};

    let mut hasher = Keccak256::new();
    for account in accounts {
        hasher.update(&account.address);
        hasher.update(&account.nonce.to_le_bytes());
        hasher.update(&account.balance);
        hasher.update(&account.code);
        for slot in &account.storage {
            hasher.update(&slot.key);
            hasher.update(&slot.value);
        }
    }
    hasher.finalize().into()
}

/// Compute state root from cache db (simplified hash)
fn compute_db_state_root(db: &CacheDB<EmptyDB>) -> [u8; 32] {
    use sha3::{Digest, Keccak256};

    let mut hasher = Keccak256::new();
    for (addr, account) in db.accounts.iter() {
        hasher.update(addr.as_slice());
        hasher.update(&account.info.nonce.to_le_bytes());
        hasher.update(&account.info.balance.to_be_bytes::<32>());
        // Note: Full MPT computation would go here
    }
    hasher.finalize().into()
}
