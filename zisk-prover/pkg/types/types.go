// Package types defines API types for the ZisK prover service.
package types

import "time"

// ProofStatus represents the current state of a proof.
type ProofStatus string

const (
	ProofStatusPending   ProofStatus = "pending"
	ProofStatusRunning   ProofStatus = "running"
	ProofStatusCompleted ProofStatus = "completed"
	ProofStatusFailed    ProofStatus = "failed"
)

// ProveRequest is the request body for POST /prove.
type ProveRequest struct {
	BlockNumber uint64 `json:"blockNumber"`
}

// ProveResponse is the response for POST /prove.
type ProveResponse struct {
	ProofID string `json:"proofId"`
}

// ProofResult represents a completed or in-progress proof.
type ProofResult struct {
	ProofID       string      `json:"proofId"`
	BlockNumber   uint64      `json:"blockNumber"`
	Status        ProofStatus `json:"status"`
	StartedAt     time.Time   `json:"startedAt"`
	CompletedAt   *time.Time  `json:"completedAt,omitempty"`
	Error         string      `json:"error,omitempty"`
	EmulatorSteps uint64      `json:"emulatorSteps,omitempty"`
	ProofData     string      `json:"proofData,omitempty"` // Base64-encoded proof
	BlockHash     string      `json:"blockHash,omitempty"`
	StateRoot     string      `json:"stateRoot,omitempty"`
	TxCount       int         `json:"txCount,omitempty"`
	GasUsed       uint64      `json:"gasUsed,omitempty"`
}

// StatusResponse is the response for GET /status.
type StatusResponse struct {
	Service       string `json:"service"`
	Version       string `json:"version"`
	ZisKVersion   string `json:"ziskVersion"`
	ProvingKey    bool   `json:"provingKey"`
	VerifyKey     bool   `json:"verifyKey"`
	L2Connected   bool   `json:"l2Connected"`
	PendingProofs int    `json:"pendingProofs"`
	TotalProofs   int    `json:"totalProofs"`
}

// BlockWitness contains all data needed to prove a block.
type BlockWitness struct {
	BlockNumber  uint64 `json:"blockNumber"`
	BlockHash    string `json:"blockHash"`
	ParentHash   string `json:"parentHash"`
	StateRoot    string `json:"stateRoot"`
	TxRoot       string `json:"txRoot"`
	ReceiptsRoot string `json:"receiptsRoot"`
	GasUsed      uint64 `json:"gasUsed"`
	GasLimit     uint64 `json:"gasLimit"`
	Timestamp    uint64 `json:"timestamp"`
	TxCount      int    `json:"txCount"`
	// Encoded block data for proving
	EncodedBlock []byte `json:"-"`
}

// HealthResponse is the response for GET /health.
type HealthResponse struct {
	Status string `json:"status"`
	L2RPC  string `json:"l2Rpc"`
}
