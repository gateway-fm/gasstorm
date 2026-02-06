// Package witness fetches block data from L2 for proving.
package witness

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rlp"
	"github.com/ethereum/go-ethereum/rpc"

	ptypes "github.com/gateway-fm/gasstorm/zisk-prover/pkg/types"
)

// Fetcher retrieves block witnesses from L2.
type Fetcher struct {
	client    *ethclient.Client
	rpcClient *rpc.Client
	logger    *slog.Logger
	l2URL     string
}

// NewFetcher creates a new witness fetcher.
func NewFetcher(l2URL string, logger *slog.Logger) (*Fetcher, error) {
	client, err := ethclient.Dial(l2URL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to L2: %w", err)
	}

	rpcClient, err := rpc.Dial(l2URL)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to L2 RPC: %w", err)
	}

	if logger == nil {
		logger = slog.Default()
	}

	return &Fetcher{
		client:    client,
		rpcClient: rpcClient,
		logger:    logger,
		l2URL:     l2URL,
	}, nil
}

// FetchBlock retrieves block data for proving.
// Note: Standard go-ethereum can't parse OP Stack deposit transactions (type 0x7E),
// so we use header-only fetching for compatibility.
func (f *Fetcher) FetchBlock(ctx context.Context, blockNumber uint64) (*ptypes.BlockWitness, error) {
	f.logger.Info("fetching block witness", "blockNumber", blockNumber)

	// Fetch header only (avoids OP Stack tx parsing issues)
	header, err := f.client.HeaderByNumber(ctx, big.NewInt(int64(blockNumber)))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch block header %d: %w", blockNumber, err)
	}

	// Get transaction count via RPC call
	txCount, err := f.client.TransactionCount(ctx, header.Hash())
	if err != nil {
		// Not fatal - just log and continue
		f.logger.Warn("failed to get tx count", "error", err)
		txCount = 0
	}

	witness := &ptypes.BlockWitness{
		BlockNumber:  blockNumber,
		BlockHash:    header.Hash().Hex(),
		ParentHash:   header.ParentHash.Hex(),
		StateRoot:    header.Root.Hex(),
		TxRoot:       header.TxHash.Hex(),
		ReceiptsRoot: header.ReceiptHash.Hex(),
		GasUsed:      header.GasUsed,
		GasLimit:     header.GasLimit,
		Timestamp:    header.Time,
		TxCount:      int(txCount),
	}

	// Encode header for witness data
	headerBytes, err := rlp.EncodeToBytes(header)
	if err == nil {
		witness.EncodedBlock = headerBytes
	}

	f.logger.Info("block witness fetched",
		"blockNumber", blockNumber,
		"txCount", witness.TxCount,
		"gasUsed", witness.GasUsed,
		"headerSize", len(witness.EncodedBlock),
	)

	return witness, nil
}

// FetchLatestBlockNumber returns the latest block number.
func (f *Fetcher) FetchLatestBlockNumber(ctx context.Context) (uint64, error) {
	return f.client.BlockNumber(ctx)
}

// CheckConnection verifies the L2 connection is working.
func (f *Fetcher) CheckConnection(ctx context.Context) error {
	_, err := f.client.BlockNumber(ctx)
	return err
}

// Close closes the L2 client connection.
func (f *Fetcher) Close() {
	f.client.Close()
	f.rpcClient.Close()
}

// BuildSTFWitness builds a complete state transition witness for the ZisK guest program.
// This fetches all data needed to re-execute the block.
func (f *Fetcher) BuildSTFWitness(ctx context.Context, blockNumber uint64) (*BlockWitness, error) {
	f.logger.Info("building STF witness", "blockNumber", blockNumber)

	// Fetch block header
	header, err := f.client.HeaderByNumber(ctx, big.NewInt(int64(blockNumber)))
	if err != nil {
		return nil, fmt.Errorf("failed to fetch header: %w", err)
	}

	// Fetch transactions via raw RPC (avoids OP Stack tx type parsing issues)
	var blockData struct {
		Transactions []json.RawMessage `json:"transactions"`
	}
	err = f.rpcClient.CallContext(ctx, &blockData, "eth_getBlockByNumber",
		fmt.Sprintf("0x%x", blockNumber), true)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch block: %w", err)
	}

	// Build witness
	witness := &BlockWitness{
		BlockNumber: blockNumber,
		Timestamp:   header.Time,
		GasLimit:    header.GasLimit,
		BaseFee:     header.BaseFee.Uint64(),
	}

	// Set coinbase
	copy(witness.Coinbase[:], header.Coinbase.Bytes())

	// Set prev block hash
	copy(witness.PrevBlockHash[:], header.ParentHash.Bytes())

	// Parse transactions and collect touched accounts
	touchedAccounts := make(map[common.Address]bool)

	for _, rawTx := range blockData.Transactions {
		var txData struct {
			From     string  `json:"from"`
			To       *string `json:"to"`
			Value    string  `json:"value"`
			Input    string  `json:"input"`
			Gas      string  `json:"gas"`
			GasPrice string  `json:"gasPrice"`
			Nonce    string  `json:"nonce"`
			Type     string  `json:"type"`
		}
		if err := json.Unmarshal(rawTx, &txData); err != nil {
			f.logger.Warn("failed to parse tx", "error", err)
			continue
		}

		// Skip deposit transactions (type 0x7e) - they're system txs
		if txData.Type == "0x7e" {
			continue
		}

		tx := TxWitness{
			Nonce: parseHexUint64(txData.Nonce),
		}

		// Parse from address
		from := common.HexToAddress(txData.From)
		copy(tx.From[:], from.Bytes())
		touchedAccounts[from] = true

		// Parse to address
		if txData.To != nil {
			to := common.HexToAddress(*txData.To)
			tx.To = new([20]byte)
			copy(tx.To[:], to.Bytes())
			touchedAccounts[to] = true
		}

		// Parse value
		value := parseHexBigInt(txData.Value)
		copy(tx.Value[:], common.LeftPadBytes(value.Bytes(), 32))

		// Parse input
		tx.Input = common.FromHex(txData.Input)

		// Parse gas
		tx.GasLimit = parseHexUint64(txData.Gas)
		tx.GasPrice = parseHexUint64(txData.GasPrice)

		witness.Transactions = append(witness.Transactions, tx)
	}

	// Fetch account states (pre-state at previous block)
	prevBlock := blockNumber - 1
	if blockNumber == 0 {
		prevBlock = 0
	}

	for addr := range touchedAccounts {
		account, err := f.fetchAccountState(ctx, addr, prevBlock)
		if err != nil {
			f.logger.Warn("failed to fetch account state", "address", addr.Hex(), "error", err)
			continue
		}
		witness.Accounts = append(witness.Accounts, *account)
	}

	f.logger.Info("STF witness built",
		"blockNumber", blockNumber,
		"txCount", len(witness.Transactions),
		"accountCount", len(witness.Accounts),
	)

	return witness, nil
}

// fetchAccountState fetches account state at a specific block.
func (f *Fetcher) fetchAccountState(ctx context.Context, addr common.Address, blockNumber uint64) (*AccountWitness, error) {
	blockNum := big.NewInt(int64(blockNumber))

	// Get balance
	balance, err := f.client.BalanceAt(ctx, addr, blockNum)
	if err != nil {
		return nil, fmt.Errorf("failed to get balance: %w", err)
	}

	// Get nonce
	nonce, err := f.client.NonceAt(ctx, addr, blockNum)
	if err != nil {
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}

	// Get code
	code, err := f.client.CodeAt(ctx, addr, blockNum)
	if err != nil {
		return nil, fmt.Errorf("failed to get code: %w", err)
	}

	account := &AccountWitness{
		Nonce: nonce,
		Code:  code,
	}
	copy(account.Address[:], addr.Bytes())
	copy(account.Balance[:], common.LeftPadBytes(balance.Bytes(), 32))

	// Note: Storage slots would need to be fetched based on traces
	// For now, we skip storage (would require debug_traceBlock)

	return account, nil
}

func parseHexUint64(s string) uint64 {
	if s == "" || s == "0x" {
		return 0
	}
	val, _ := new(big.Int).SetString(s[2:], 16)
	if val == nil {
		return 0
	}
	return val.Uint64()
}

func parseHexBigInt(s string) *big.Int {
	if s == "" || s == "0x" || s == "0x0" {
		return big.NewInt(0)
	}
	val, _ := new(big.Int).SetString(s[2:], 16)
	if val == nil {
		return big.NewInt(0)
	}
	return val
}

// BlockHeader represents a simplified block header for JSON output.
type BlockHeader struct {
	Number       uint64         `json:"number"`
	Hash         common.Hash    `json:"hash"`
	ParentHash   common.Hash    `json:"parentHash"`
	StateRoot    common.Hash    `json:"stateRoot"`
	TxRoot       common.Hash    `json:"txRoot"`
	ReceiptsRoot common.Hash    `json:"receiptsRoot"`
	GasUsed      uint64         `json:"gasUsed"`
	GasLimit     uint64         `json:"gasLimit"`
	Timestamp    uint64         `json:"timestamp"`
	BaseFee      *big.Int       `json:"baseFee,omitempty"`
}

// FetchBlockHeader retrieves just the block header.
func (f *Fetcher) FetchBlockHeader(ctx context.Context, blockNumber uint64) (*types.Header, error) {
	return f.client.HeaderByNumber(ctx, big.NewInt(int64(blockNumber)))
}

// CreateProverInput creates JSON input for the ZisK prover program.
func (f *Fetcher) CreateProverInput(witness *ptypes.BlockWitness) ([]byte, error) {
	input := map[string]interface{}{
		"blockNumber":  witness.BlockNumber,
		"blockHash":    witness.BlockHash,
		"parentHash":   witness.ParentHash,
		"stateRoot":    witness.StateRoot,
		"txRoot":       witness.TxRoot,
		"receiptsRoot": witness.ReceiptsRoot,
		"gasUsed":      witness.GasUsed,
		"gasLimit":     witness.GasLimit,
		"timestamp":    witness.Timestamp,
		"txCount":      witness.TxCount,
	}

	return json.Marshal(input)
}
