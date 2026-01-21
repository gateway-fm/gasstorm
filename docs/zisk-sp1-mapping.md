# SP1 → ZisK API Mapping

This document maps SP1 zkVM APIs to their ZisK equivalents for porting Kona or other SP1 programs.

## Core I/O APIs

| Operation | SP1 | ZisK |
|-----------|-----|------|
| Entry point | `sp1_zkvm::entrypoint!(main)` | `ziskos::entrypoint!(main)` |
| Read typed input | `sp1_zkvm::io::read::<T>()` | `ziskos::read_input_slice()` + deserialize |
| Read bytes | `sp1_zkvm::io::read_vec()` | `ziskos::read_input_slice()` |
| Commit output | `sp1_zkvm::io::commit(&data)` | `ziskos::set_output(idx, value)` |
| Commit slice | `sp1_zkvm::io::commit_slice(&bytes)` | Multiple `set_output()` calls |

## Key Differences

### Input Reading

**SP1** uses typed deserialization:
```rust
let block_num = sp1_zkvm::io::read::<u64>();
let data = sp1_zkvm::io::read::<MyStruct>();
```

**ZisK** provides raw bytes:
```rust
let input = ziskos::read_input_slice();
let block_num = u64::from_le_bytes(input[0..8].try_into().unwrap());
// Or use serde/bincode for complex types
```

### Output Commitment

**SP1** commits serialized data:
```rust
sp1_zkvm::io::commit(&result);
sp1_zkvm::io::commit_slice(&bytes);
```

**ZisK** writes 32-bit values at indexed positions:
```rust
// For a 32-byte hash, write 8 u32 values
for i in 0..8 {
    let val = u32::from_be_bytes(hash[i*4..(i+1)*4].try_into().unwrap());
    ziskos::set_output(i, val);
}
```

## Precompiles Comparison

| Operation | SP1 | ZisK | Notes |
|-----------|-----|------|-------|
| Keccak-256 | `keccak256` patched crate | `keccakf` precompile | Both accelerated |
| SHA-256 | `sha2` patched crate | `sha256f` precompile | Both accelerated |
| secp256k1 | `secp256k1` patched crate | ❌ **Not available** | Critical gap |
| ed25519 | `ed25519-dalek` patched | ❌ Not available | |
| Big integers | `bigint` precompile | `big_int` (add256 only) | Limited |

### Precompile Usage

**SP1** uses patched crates in Cargo.toml:
```toml
# Routes to SP1 precompiles automatically
sha2-v0-10-9 = { git = "https://github.com/sp1-patches/RustCrypto-hashes", ... }
```

**ZisK** uses standard crates (acceleration via linked libs):
```toml
sha2 = "0.10.8"  # Automatically uses ziskos precompile when targeting ZisK
```

## Critical Gap: secp256k1

ZisK currently lacks secp256k1/ECDSA/ecrecover precompiles. For Ethereum block proving this is critical because:

1. **Transaction signature verification** requires ecrecover
2. **Every transaction** must verify sender signature
3. Without precompile: ~100x slower (pure Rust implementation)

### Workaround Options

1. **Pure Rust fallback** - Use `k256` crate without acceleration (~100x slower)
2. **Wait for ZisK update** - secp256k1 is likely on roadmap
3. **Custom precompile** - Add secp256k1 to ZisK (requires forking)

## Porting Kona to ZisK

### Step 1: Update Cargo.toml

```toml
# Replace SP1 dependency
# From:
sp1-zkvm = "4.0.0"

# To:
ziskos = { git = "https://github.com/0xPolygonHermez/zisk.git" }
```

### Step 2: Update Entry Point

```rust
// From:
sp1_zkvm::entrypoint!(main);

// To:
#![no_main]
ziskos::entrypoint!(main);
```

### Step 3: Update I/O Calls

```rust
// From:
let boot_info = sp1_zkvm::io::read::<BootInfo>();
sp1_zkvm::io::commit(&result);

// To:
let input = ziskos::read_input_slice();
let boot_info: BootInfo = bincode::deserialize(&input).unwrap();
// ... compute result ...
let output = bincode::serialize(&result).unwrap();
for (i, chunk) in output.chunks(4).enumerate() {
    let val = u32::from_le_bytes(chunk.try_into().unwrap_or([0; 4]));
    ziskos::set_output(i, val);
}
```

### Step 4: Handle secp256k1

Option A - Pure Rust (slow but works):
```toml
[dependencies]
k256 = { version = "0.13", default-features = false, features = ["ecdsa"] }
```

Option B - Stub for testing (skip signature verification):
```rust
fn verify_signature(_sig: &[u8], _msg: &[u8], _pubkey: &[u8]) -> bool {
    true // DANGER: Only for testing!
}
```

### Step 5: Build for ZisK

```bash
# Change target
cargo-zisk build --release

# Test in emulator
ziskemu -e target/riscv64ima-zisk-zkvm-elf/release/kona-client -i input.bin
```

## Build Targets

| zkVM | Target Triple | Architecture |
|------|--------------|--------------|
| SP1 | `riscv32im-succinct-zkvm-elf` | RISC-V 32-bit |
| ZisK | `riscv64ima-zisk-zkvm-elf` | RISC-V 64-bit |

Note: The 32-bit vs 64-bit difference may require code changes for pointer sizes.

## Performance Expectations

| Metric | SP1 | ZisK | Notes |
|--------|-----|------|-------|
| Ethereum L1 block | ~1 min | ~2 min | Single RTX 4090 |
| 1.5 gigagas block (our PoC) | N/A | ~3+ hours | Too large for real-time |

Real-time proving is not feasible for high-gas blocks. Consider:
- Batch multiple blocks per proof
- Async proving pipeline (proofs lag execution)
- Use preconfirmations for soft finality

## References

- [SP1 Documentation](https://docs.succinct.xyz/sp1/)
- [ZisK GitHub](https://github.com/0xPolygonHermez/zisk)
- [Kona Repository](https://github.com/ethereum-optimism/kona)
- [OP-Succinct](https://github.com/succinctlabs/op-succinct)
