package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerBuilderTools registers all block builder tools on the MCP server.
func registerBuilderTools(s *server.MCPServer, client *httpClient) {
	registerBuilderStatus(s, client)
	registerBuilderHealth(s, client)
	registerTxpoolStatus(s, client)
	registerTxpoolInspect(s, client)
	registerGetNonce(s, client)
	registerSendTx(s, client)
	registerResetNonces(s, client)
}

func registerBuilderStatus(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_status",
		mcp.WithDescription("Get block builder status: blocks built, TXs processed, pending count, build times, circuit breaker state, gas metrics, and configuration."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/status")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Builder unreachable: %v\n\nIs the stack running? Try: make run", err)), nil
		}
		var status map[string]any
		if err := json.Unmarshal(raw, &status); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing status: %v", err)), nil
		}
		return mcp.NewToolResultText(fmtBuilderStatus(status)), nil
	})
}

func registerBuilderHealth(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_health",
		mcp.WithDescription("Quick health check for the block builder. Returns OK or error with recovery hints."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/status")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Builder unhealthy: %v\n\nRecovery:\n- Check if stack is running: make status\n- Restart builder: make restart svc=block-builder", err)), nil
		}
		var status map[string]any
		json.Unmarshal(raw, &status)
		return mcp.NewToolResultText(joinLines(
			sectionf("Builder Health: OK"),
			kvf("Blocks Built", formatNumber(getFloat(status, "blocksBuilt"))),
			kvf("Pending TXs", formatNumber(getFloat(status, "pendingTxCount"))),
		)), nil
	})
}

func registerTxpoolStatus(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_txpool_status",
		mcp.WithDescription("Get transaction pool status: counts of pending (executable) and queued (future) transactions."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := client.rpcCall("txpool_status")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("txpool_status failed: %v", err)), nil
		}
		var status map[string]string
		if err := json.Unmarshal(result, &status); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing response: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Transaction Pool"),
			kvf("Pending", status["pending"]),
			kvf("Queued", status["queued"]),
		)), nil
	})
}

func registerTxpoolInspect(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_txpool_inspect",
		mcp.WithDescription("Inspect transaction pool contents. Without address: returns summary. With address: returns transactions for that account."),
		mcp.WithString("address",
			mcp.Description("Optional: Ethereum address (0x...) to inspect"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		addr := req.GetString("address", "")

		if addr != "" {
			result, err := client.rpcCall("txpool_contentFrom", addr)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("txpool_contentFrom failed: %v", err)), nil
			}
			var data map[string]map[string]json.RawMessage
			if err := json.Unmarshal(result, &data); err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Parsing: %v", err)), nil
			}
			return mcp.NewToolResultText(joinLines(
				sectionf("TXs for "+addr),
				kvf("Pending", len(data["pending"])),
				kvf("Queued", len(data["queued"])),
			)), nil
		}

		result, err := client.rpcCall("txpool_inspect")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("txpool_inspect failed: %v", err)), nil
		}
		var data map[string]map[string]map[string]string
		json.Unmarshal(result, &data)
		pendingCount := countTxpoolEntries(data["pending"])
		queuedCount := countTxpoolEntries(data["queued"])
		return mcp.NewToolResultText(joinLines(
			sectionf("Transaction Pool Inspect"),
			kvf("Pending TXs", formatNumber(pendingCount)),
			kvf("Queued TXs", formatNumber(queuedCount)),
		)), nil
	})
}

func registerGetNonce(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_get_nonce",
		mcp.WithDescription("Get the pending nonce for an Ethereum address from the builder's cache."),
		mcp.WithString("address",
			mcp.Required(),
			mcp.Description("Ethereum address (0x...)"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		addr, err := req.RequireString("address")
		if err != nil {
			return mcp.NewToolResultError("address is required"), nil
		}
		result, err := client.rpcCall("eth_getPendingNonce", addr)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("eth_getPendingNonce failed: %v", err)), nil
		}
		var nonceHex string
		json.Unmarshal(result, &nonceHex)
		return mcp.NewToolResultText(joinLines(
			sectionf("Pending Nonce"),
			kvf("Address", addr),
			kvf("Nonce", nonceHex),
		)), nil
	})
}

func registerSendTx(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_send_tx",
		mcp.WithDescription("Send a signed raw transaction to the block builder. MUTATING."),
		mcp.WithString("raw_tx",
			mcp.Required(),
			mcp.Description("Signed raw transaction hex (0x...)"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		rawTx, err := req.RequireString("raw_tx")
		if err != nil {
			return mcp.NewToolResultError("raw_tx is required"), nil
		}
		result, err := client.rpcCall("eth_sendRawTransaction", rawTx)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("eth_sendRawTransaction failed: %v", err)), nil
		}
		var txHash string
		json.Unmarshal(result, &txHash)
		return mcp.NewToolResultText(joinLines(
			sectionf("Transaction Sent"),
			kvf("TX Hash", txHash),
		)), nil
	})
}

func registerResetNonces(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("builder_reset_nonces",
		mcp.WithDescription("Reset the builder's nonce cache, pending pool, seen hashes, and circuit breaker. MUTATING."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		_, err := client.post("/reset-nonces", nil)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Reset failed: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Nonce Reset"),
			kvf("Status", "nonces_reset"),
			"",
			"Cleared: nonce cache, pending pool, seen hashes, circuit breaker",
		)), nil
	})
}

// fmtBuilderStatus formats the /status response.
func fmtBuilderStatus(s map[string]any) string {
	lines := joinLines(
		sectionf("Block Builder Status"),
		kvf("Blocks Built", formatNumber(getFloat(s, "blocksBuilt"))),
		kvf("TXs Processed", formatNumber(getFloat(s, "txsProcessed"))),
		kvf("TXs Dropped", formatNumber(getFloat(s, "txsDropped"))),
		kvf("TXs Requeued", formatNumber(getFloat(s, "txsRequeued"))),
		kvf("Pending TX Count", formatNumber(getFloat(s, "pendingTxCount"))),
		kvf("Avg Build Time", fmt.Sprintf("%.1fms", getFloat(s, "avgBuildTimeMs"))),
		"",
		sectionf("Configuration"),
		kvf("Block Time", fmt.Sprintf("%dms", int64(getFloat(s, "blockTimeMs")))),
		kvf("Gas Limit", formatNumber(getFloat(s, "gasLimit"))),
		kvf("Max TXs/Block", formatNumber(getFloat(s, "maxTxsPerBlock"))),
		kvf("TX Ordering", getString(s, "txOrdering")),
	)

	if cb, ok := s["circuitBreaker"].(map[string]any); ok {
		lines += "\n\n" + joinLines(
			sectionf("Circuit Breaker"),
			kvf("State", cbState(getBool(cb, "isOpen"))),
			kvf("Rejection Rate", formatPct(getFloat(cb, "rejectionRatePct"))),
		)
	}

	return lines
}

func countTxpoolEntries(addrs map[string]map[string]string) int {
	total := 0
	for _, nonces := range addrs {
		total += len(nonces)
	}
	return total
}
