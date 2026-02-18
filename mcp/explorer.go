package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerExplorerTools registers block explorer tools on the MCP server.
func registerExplorerTools(s *server.MCPServer, client *httpClient) {
	registerExplorerHealth(s, client)
	registerExplorerStats(s, client)
	registerExplorerBlocks(s, client)
	registerExplorerBlock(s, client)
	registerExplorerTx(s, client)
	registerExplorerSearch(s, client)
}

func registerExplorerHealth(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_health",
		mcp.WithDescription("Check if the block explorer API is reachable."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/health")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer unreachable: %v\n\nIs the explorer running? Try: make run-with-explorer", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		return mcp.NewToolResultText(joinLines(
			sectionf("Explorer Health: OK"),
			kvf("Status", getString(m, "status")),
		)), nil
	})
}

func registerExplorerStats(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_stats",
		mcp.WithDescription("Get block explorer indexing stats: latest block, total transactions, sync status."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/api/stats")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer stats failed: %v", err)), nil
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing stats: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Explorer Stats"),
			kvf("Latest Block", formatNumber(getFloat(m, "latestBlock"))),
			kvf("Total Blocks", formatNumber(getFloat(m, "totalBlocks"))),
			kvf("Total TXs", formatNumber(getFloat(m, "totalTransactions"))),
			kvf("Total Addresses", formatNumber(getFloat(m, "totalAddresses"))),
		)), nil
	})
}

func registerExplorerBlocks(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_blocks",
		mcp.WithDescription("List recent indexed blocks."),
		mcp.WithNumber("limit", mcp.Description("Max blocks to return (default: 10)")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		limit := req.GetInt("limit", 10)
		raw, err := client.get(fmt.Sprintf("/api/blocks?limit=%d", limit))
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer blocks failed: %v", err)), nil
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing blocks: %v", err)), nil
		}

		lines := sectionf("Recent Blocks") + "\n"
		blocks, _ := m["blocks"].([]any)
		if len(blocks) == 0 {
			lines += "No blocks indexed yet."
			return mcp.NewToolResultText(lines), nil
		}
		for _, b := range blocks {
			block, ok := b.(map[string]any)
			if !ok {
				continue
			}
			lines += fmt.Sprintf("\n### Block %s\n", formatNumber(getFloat(block, "number")))
			lines += joinLines(
				kvf("TXs", formatNumber(getFloat(block, "transactionCount"))),
				kvf("Gas Used", formatNumber(getFloat(block, "gasUsed"))),
				kvf("Timestamp", getString(block, "timestamp")),
			) + "\n"
		}
		return mcp.NewToolResultText(lines), nil
	})
}

func registerExplorerBlock(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_block",
		mcp.WithDescription("Get block details by number."),
		mcp.WithString("number", mcp.Required(), mcp.Description("Block number")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		number, err := req.RequireString("number")
		if err != nil {
			return mcp.NewToolResultError("number is required"), nil
		}
		raw, err := client.get("/api/blocks/" + number)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer block failed: %v", err)), nil
		}
		var block map[string]any
		if err := json.Unmarshal(raw, &block); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing block: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Block "+number),
			kvf("Hash", getString(block, "hash")),
			kvf("TXs", formatNumber(getFloat(block, "transactionCount"))),
			kvf("Gas Used", formatNumber(getFloat(block, "gasUsed"))),
			kvf("Gas Limit", formatNumber(getFloat(block, "gasLimit"))),
			kvf("Timestamp", getString(block, "timestamp")),
			kvf("Miner", getString(block, "miner")),
		)), nil
	})
}

func registerExplorerTx(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_tx",
		mcp.WithDescription("Get transaction details by hash."),
		mcp.WithString("hash", mcp.Required(), mcp.Description("Transaction hash (0x...)")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		hash, err := req.RequireString("hash")
		if err != nil {
			return mcp.NewToolResultError("hash is required"), nil
		}
		raw, err := client.get("/api/transactions/" + hash)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer tx failed: %v", err)), nil
		}
		var tx map[string]any
		if err := json.Unmarshal(raw, &tx); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing tx: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Transaction"),
			kvf("Hash", getString(tx, "hash")),
			kvf("Block", formatNumber(getFloat(tx, "blockNumber"))),
			kvf("From", getString(tx, "from")),
			kvf("To", getString(tx, "to")),
			kvf("Value", getString(tx, "value")),
			kvf("Gas Used", formatNumber(getFloat(tx, "gasUsed"))),
			kvf("Status", formatNumber(getFloat(tx, "status"))),
		)), nil
	})
}

func registerExplorerSearch(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("explorer_search",
		mcp.WithDescription("Search blocks, transactions, and addresses in the explorer."),
		mcp.WithString("query", mcp.Required(), mcp.Description("Search query (block number, tx hash, or address)")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		query, err := req.RequireString("query")
		if err != nil {
			return mcp.NewToolResultError("query is required"), nil
		}
		raw, err := client.get("/api/search?q=" + query)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Explorer search failed: %v", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		pretty, _ := json.MarshalIndent(m, "", "  ")
		return mcp.NewToolResultText(joinLines(
			sectionf("Search Results: "+query),
			string(pretty),
		)), nil
	})
}
