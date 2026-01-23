// Package prover wraps ZisK emulator and prover execution.
package prover

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gateway/sequencer-poc/zisk-prover/internal/witness"
	"github.com/gateway/sequencer-poc/zisk-prover/pkg/types"
)

// Config holds prover configuration.
type Config struct {
	ZisKBinDir   string // Path to ~/.zisk/bin
	ELFPath      string // Path to compiled guest program (zisk-stf)
	SetupDir     string // Path to proving key setup
	UseEmulator  bool   // Use emulator instead of real prover
	ProofTimeout time.Duration
	GuestDir     string // Path to guest program source
}

// DefaultConfig returns default prover configuration.
func DefaultConfig() *Config {
	home, _ := os.UserHomeDir()
	return &Config{
		ZisKBinDir:   filepath.Join(home, ".zisk", "bin"),
		ELFPath:      "", // Set after building guest
		SetupDir:     filepath.Join(home, ".zisk", "setup"),
		UseEmulator:  true, // Default to emulator for dev
		ProofTimeout: 30 * time.Minute,
		GuestDir:     "", // Set to zisk-prover/guest
	}
}

// Prover manages ZisK proof generation.
type Prover struct {
	cfg       *Config
	logger    *slog.Logger
	proofs    map[string]*types.ProofResult
	proofsMu  sync.RWMutex
	proofChan chan *proofJob
	wg        sync.WaitGroup
}

type proofJob struct {
	proofID      string
	blockWitness *types.BlockWitness  // Simple witness (header only)
	stfWitness   *witness.BlockWitness // Full STF witness
}

// New creates a new ZisK prover.
func New(cfg *Config, logger *slog.Logger) (*Prover, error) {
	if logger == nil {
		logger = slog.Default()
	}

	// Verify ZisK tools exist
	ziskemu := filepath.Join(cfg.ZisKBinDir, "ziskemu")
	if _, err := os.Stat(ziskemu); os.IsNotExist(err) {
		return nil, fmt.Errorf("ziskemu not found at %s", ziskemu)
	}

	p := &Prover{
		cfg:       cfg,
		logger:    logger,
		proofs:    make(map[string]*types.ProofResult),
		proofChan: make(chan *proofJob, 100),
	}

	// Start proof worker
	p.wg.Add(1)
	go p.proofWorker()

	return p, nil
}

// Prove submits a block for proving and returns a proof ID.
func (p *Prover) Prove(blockWitness *types.BlockWitness) (string, error) {
	// Generate proof ID from block hash
	proofID := fmt.Sprintf("proof-%d-%s", blockWitness.BlockNumber, blockWitness.BlockHash[:10])

	result := &types.ProofResult{
		ProofID:     proofID,
		BlockNumber: blockWitness.BlockNumber,
		BlockHash:   blockWitness.BlockHash,
		StateRoot:   blockWitness.StateRoot,
		TxCount:     blockWitness.TxCount,
		GasUsed:     blockWitness.GasUsed,
		Status:      types.ProofStatusPending,
		StartedAt:   time.Now(),
	}

	p.proofsMu.Lock()
	p.proofs[proofID] = result
	p.proofsMu.Unlock()

	// Queue the proof job
	p.proofChan <- &proofJob{
		proofID:      proofID,
		blockWitness: blockWitness,
	}

	p.logger.Info("proof job queued",
		"proofId", proofID,
		"blockNumber", blockWitness.BlockNumber,
	)

	return proofID, nil
}

// ProveSTF submits a full state transition witness for proving.
// This uses the ZisK guest program to re-execute the block.
func (p *Prover) ProveSTF(stfWitness *witness.BlockWitness, blockHash string) (string, error) {
	proofID := fmt.Sprintf("stf-%d-%s", stfWitness.BlockNumber, blockHash[:10])

	result := &types.ProofResult{
		ProofID:     proofID,
		BlockNumber: stfWitness.BlockNumber,
		BlockHash:   blockHash,
		TxCount:     len(stfWitness.Transactions),
		Status:      types.ProofStatusPending,
		StartedAt:   time.Now(),
	}

	p.proofsMu.Lock()
	p.proofs[proofID] = result
	p.proofsMu.Unlock()

	// Queue the STF proof job
	p.proofChan <- &proofJob{
		proofID:    proofID,
		stfWitness: stfWitness,
	}

	p.logger.Info("STF proof job queued",
		"proofId", proofID,
		"blockNumber", stfWitness.BlockNumber,
		"txCount", len(stfWitness.Transactions),
		"accountCount", len(stfWitness.Accounts),
	)

	return proofID, nil
}

// GetProof retrieves a proof by ID.
func (p *Prover) GetProof(proofID string) (*types.ProofResult, error) {
	p.proofsMu.RLock()
	defer p.proofsMu.RUnlock()

	result, ok := p.proofs[proofID]
	if !ok {
		return nil, fmt.Errorf("proof not found: %s", proofID)
	}

	return result, nil
}

// ListProofs returns all proofs.
func (p *Prover) ListProofs() []*types.ProofResult {
	p.proofsMu.RLock()
	defer p.proofsMu.RUnlock()

	results := make([]*types.ProofResult, 0, len(p.proofs))
	for _, r := range p.proofs {
		results = append(results, r)
	}
	return results
}

// PendingCount returns the number of pending proofs.
func (p *Prover) PendingCount() int {
	p.proofsMu.RLock()
	defer p.proofsMu.RUnlock()

	count := 0
	for _, r := range p.proofs {
		if r.Status == types.ProofStatusPending || r.Status == types.ProofStatusRunning {
			count++
		}
	}
	return count
}

// TotalCount returns the total number of proofs.
func (p *Prover) TotalCount() int {
	p.proofsMu.RLock()
	defer p.proofsMu.RUnlock()
	return len(p.proofs)
}

// HasProvingKey returns true if the proving key is installed.
func (p *Prover) HasProvingKey() bool {
	provingKeyPath := filepath.Join(p.cfg.SetupDir, "proving")
	_, err := os.Stat(provingKeyPath)
	return err == nil
}

// HasVerifyKey returns true if the verify key is installed.
func (p *Prover) HasVerifyKey() bool {
	verifyKeyPath := filepath.Join(p.cfg.SetupDir, "verify")
	_, err := os.Stat(verifyKeyPath)
	return err == nil
}

// GetZisKVersion returns the installed ZisK version.
func (p *Prover) GetZisKVersion() string {
	cargoZisk := filepath.Join(p.cfg.ZisKBinDir, "cargo-zisk")
	cmd := exec.Command(cargoZisk, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	parts := strings.Fields(string(out))
	if len(parts) >= 2 {
		return parts[1]
	}
	return strings.TrimSpace(string(out))
}

// Close shuts down the prover.
func (p *Prover) Close() {
	close(p.proofChan)
	p.wg.Wait()
}

func (p *Prover) proofWorker() {
	defer p.wg.Done()

	for job := range p.proofChan {
		p.processProof(job)
	}
}

func (p *Prover) processProof(job *proofJob) {
	p.proofsMu.Lock()
	result := p.proofs[job.proofID]
	result.Status = types.ProofStatusRunning
	p.proofsMu.Unlock()

	var blockNumber uint64
	if job.blockWitness != nil {
		blockNumber = job.blockWitness.BlockNumber
	} else if job.stfWitness != nil {
		blockNumber = job.stfWitness.BlockNumber
	}

	p.logger.Info("starting proof generation",
		"proofId", job.proofID,
		"blockNumber", blockNumber,
		"useEmulator", p.cfg.UseEmulator,
		"isSTF", job.stfWitness != nil,
	)

	var err error
	var proofData string
	var steps uint64

	if job.stfWitness != nil {
		// Full STF proof using ZisK guest program
		proofData, steps, err = p.runSTFProof(job.stfWitness)
	} else if p.cfg.UseEmulator {
		proofData, steps, err = p.runEmulator(job.blockWitness)
	} else {
		proofData, steps, err = p.runProver(job.blockWitness)
	}

	now := time.Now()
	p.proofsMu.Lock()
	if err != nil {
		result.Status = types.ProofStatusFailed
		result.Error = err.Error()
		p.logger.Error("proof generation failed",
			"proofId", job.proofID,
			"error", err,
		)
	} else {
		result.Status = types.ProofStatusCompleted
		result.ProofData = proofData
		result.EmulatorSteps = steps
		p.logger.Info("proof generation completed",
			"proofId", job.proofID,
			"steps", steps,
			"duration", now.Sub(result.StartedAt),
		)
	}
	result.CompletedAt = &now
	p.proofsMu.Unlock()
}

func (p *Prover) runEmulator(witness *types.BlockWitness) (string, uint64, error) {
	// Create input from witness data
	inputData := witness.EncodedBlock
	if len(inputData) == 0 {
		// Fallback: hash block metadata
		inputData = fmt.Appendf(nil, "%d:%s:%s:%d",
			witness.BlockNumber,
			witness.BlockHash,
			witness.StateRoot,
			witness.GasUsed,
		)
	}

	// If we have an ELF configured, run ziskemu with the STF guest program
	if p.cfg.ELFPath != "" {
		return p.runZisKEmulator(inputData)
	}

	// Fallback: compute SHA256 hash as "proof"
	// WARNING: This is a MOCK proof for testing/emulator fallback only.
	// SHA256 is NOT a cryptographically valid ZK proof!
	p.logger.Warn("using mock proof (SHA256 hash) - NOT cryptographically secure")
	hash := sha256.Sum256(inputData)
	proofData := hex.EncodeToString(hash[:])

	// Estimate steps based on input size
	steps := uint64(len(inputData) * 100)

	return proofData, steps, nil
}

func (p *Prover) runZisKEmulator(input []byte) (string, uint64, error) {
	// Write input to temp file
	inputFile, err := os.CreateTemp("", "zisk-input-*.bin")
	if err != nil {
		return "", 0, fmt.Errorf("failed to create input file: %w", err)
	}
	defer os.Remove(inputFile.Name())

	if _, err := inputFile.Write(input); err != nil {
		inputFile.Close()
		return "", 0, fmt.Errorf("failed to write input: %w", err)
	}
	inputFile.Close()

	// Run ziskemu
	ziskemu := filepath.Join(p.cfg.ZisKBinDir, "ziskemu")
	ctx, cancel := context.WithTimeout(context.Background(), p.cfg.ProofTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, ziskemu, "-e", p.cfg.ELFPath, "-i", inputFile.Name())

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	p.logger.Debug("running ziskemu",
		"elf", p.cfg.ELFPath,
		"inputSize", len(input),
	)

	if err := cmd.Run(); err != nil {
		return "", 0, fmt.Errorf("ziskemu failed: %w: %s", err, stderr.String())
	}

	// Parse output
	output := strings.TrimSpace(stdout.String())

	// For SHA hasher, output is 8 lines of 32-bit hex values
	// We concatenate them as the "proof"
	proofData := strings.ReplaceAll(output, "\n", "")

	// Estimate steps (would need to parse ziskemu stats for real count)
	steps := uint64(len(input) * 1000)

	return proofData, steps, nil
}

func (p *Prover) runProver(_ *types.BlockWitness) (string, uint64, error) {
	// Check for proving key
	if !p.HasProvingKey() {
		return "", 0, fmt.Errorf("proving key not installed; run: ziskup --provingkey")
	}

	// Real proving requires:
	// 1. Build guest: cargo-zisk build --release
	// 2. Setup ROM: cargo-zisk rom-setup --elf <path>
	// 3. Generate proof: cargo-zisk prove -e <elf> -i <input> -o <output>
	// 4. Return the proof from <output>/vadcop_final_proof.bin

	return "", 0, fmt.Errorf("real proving not implemented; use emulator mode")
}

// runSTFProof executes the full state transition proof using the ZisK guest program.
func (p *Prover) runSTFProof(stfWitness *witness.BlockWitness) (string, uint64, error) {
	// Serialize witness for ZisK
	witnessData, err := witness.SerializeForZisK(stfWitness)
	if err != nil {
		return "", 0, fmt.Errorf("failed to serialize witness: %w", err)
	}

	p.logger.Debug("STF witness serialized",
		"size", len(witnessData),
		"txCount", len(stfWitness.Transactions),
		"accountCount", len(stfWitness.Accounts),
	)

	// Check if we have the guest ELF
	elfPath := p.cfg.ELFPath
	if elfPath == "" {
		// Try default path
		elfPath = filepath.Join(p.cfg.GuestDir, "target/riscv64ima-zisk-zkvm-elf/release/zisk-stf")
	}

	if _, err := os.Stat(elfPath); os.IsNotExist(err) {
		// Fallback to hash-based "proof"
		p.logger.Warn("STF guest ELF not found, using hash fallback", "path", elfPath)
		hash := sha256.Sum256(witnessData)
		return hex.EncodeToString(hash[:]), uint64(len(witnessData) * 100), nil
	}

	// Run ZisK emulator with the STF guest
	return p.runZisKEmulator(witnessData)
}
