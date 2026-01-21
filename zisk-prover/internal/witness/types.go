// Package witness provides block witness types for ZisK STF proving.
package witness

// BlockWitness contains all data needed to prove a block's state transition.
// Must match the Rust BlockWitness struct in guest/src/main.rs
type BlockWitness struct {
	BlockNumber   uint64           `json:"block_number"`
	Timestamp     uint64           `json:"timestamp"`
	GasLimit      uint64           `json:"gas_limit"`
	BaseFee       uint64           `json:"base_fee"`
	Coinbase      [20]byte         `json:"coinbase"`
	PrevBlockHash [32]byte         `json:"prev_block_hash"`
	Accounts      []AccountWitness `json:"accounts"`
	Transactions  []TxWitness      `json:"transactions"`
}

// AccountWitness represents pre-state of an account.
type AccountWitness struct {
	Address [20]byte      `json:"address"`
	Nonce   uint64        `json:"nonce"`
	Balance [32]byte      `json:"balance"` // U256 as big-endian bytes
	Code    []byte        `json:"code"`
	Storage []StorageSlot `json:"storage"`
}

// StorageSlot represents a storage key-value pair.
type StorageSlot struct {
	Key   [32]byte `json:"key"`
	Value [32]byte `json:"value"`
}

// TxWitness represents a transaction to execute.
type TxWitness struct {
	From     [20]byte  `json:"from"`
	To       *[20]byte `json:"to"` // nil for contract creation
	Value    [32]byte  `json:"value"`
	Input    []byte    `json:"input"`
	GasLimit uint64    `json:"gas_limit"`
	GasPrice uint64    `json:"gas_price"`
	Nonce    uint64    `json:"nonce"`
}

// ProofOutput is the output committed by the ZisK guest program.
type ProofOutput struct {
	BlockNumber   uint64   `json:"block_number"`
	PreStateRoot  [32]byte `json:"pre_state_root"`
	PostStateRoot [32]byte `json:"post_state_root"`
	GasUsed       uint64   `json:"gas_used"`
	TxCount       uint64   `json:"tx_count"`
}
