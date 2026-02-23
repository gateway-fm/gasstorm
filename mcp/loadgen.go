package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerLoadgenTools registers all load generator tools on the MCP server.
func registerLoadgenTools(s *server.MCPServer, client *httpClient) {
	registerLoadgenStatus(s, client)
	registerLoadgenHealth(s, client)
	registerLoadgenStart(s, client)
	registerLoadgenStop(s, client)
	registerLoadgenReset(s, client)
	registerLoadgenRecycle(s, client)
	registerLoadgenHistory(s, client)
	registerLoadgenTestDetail(s, client)
	registerLoadgenTestTxs(s, client)
	registerLoadgenDeleteRun(s, client)
}

func registerLoadgenStatus(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_status",
		mcp.WithDescription("Get current load generator status: test state, TXs sent/confirmed/failed, TPS, latency stats."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/v1/status")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Load generator unreachable: %v", err)), nil
		}
		return mcp.NewToolResultText(fmtLoadgenStatus(raw)), nil
	})
}

func registerLoadgenHealth(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_health",
		mcp.WithDescription("Quick health check for the load generator."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/ready")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Load generator unhealthy: %v", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		ready, _ := m["ready"].(bool)
		state := "READY"
		if !ready {
			state = "NOT READY"
		}
		return mcp.NewToolResultText(sectionf("Load Generator Health: " + state)), nil
	})
}

func registerLoadgenStart(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_start",
		mcp.WithDescription("Start a load test. MUTATING. Patterns: constant, ramp, spike, adaptive, realistic, adaptive-realistic."),
		mcp.WithString("pattern",
			mcp.Required(),
			mcp.Description("Load pattern: constant, ramp, spike, adaptive, realistic, adaptive-realistic"),
		),
		mcp.WithNumber("duration_sec",
			mcp.Required(),
			mcp.Description("Test duration in seconds (1-3600)"),
		),
		mcp.WithString("transaction_type",
			mcp.Description("TX type: eth-transfer, erc20-transfer, erc20-approve, uniswap-swap, storage-write, heavy-compute"),
		),
		mcp.WithNumber("num_accounts", mcp.Description("Number of accounts")),
		mcp.WithNumber("constant_rate", mcp.Description("TPS for constant pattern")),
		mcp.WithNumber("ramp_start", mcp.Description("Start TPS for ramp")),
		mcp.WithNumber("ramp_end", mcp.Description("End TPS for ramp")),
		mcp.WithNumber("ramp_steps", mcp.Description("Steps for ramp")),
		mcp.WithNumber("baseline_rate", mcp.Description("Baseline TPS for spike")),
		mcp.WithNumber("spike_rate", mcp.Description("Spike TPS")),
		mcp.WithNumber("spike_duration", mcp.Description("Spike duration (seconds)")),
		mcp.WithNumber("spike_interval", mcp.Description("Spike interval (seconds)")),
		mcp.WithNumber("adaptive_initial_rate", mcp.Description("Initial TPS for adaptive")),
		// Realistic pattern parameters
		mcp.WithNumber("realistic_target_tps", mcp.Description("Target TPS for realistic pattern")),
		mcp.WithNumber("realistic_min_tip_gwei", mcp.Description("Min tip in Gwei for realistic pattern (default: 1.0)")),
		mcp.WithNumber("realistic_max_tip_gwei", mcp.Description("Max tip in Gwei for realistic pattern (default: 100.0)")),
		mcp.WithString("realistic_tip_distribution", mcp.Description("Tip distribution for realistic pattern: exponential (default), power-law, uniform")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		pattern, err := req.RequireString("pattern")
		if err != nil {
			return mcp.NewToolResultError("pattern is required"), nil
		}
		durationSec := req.GetInt("duration_sec", 0)
		if durationSec <= 0 {
			return mcp.NewToolResultError("duration_sec must be positive"), nil
		}

		payload := map[string]any{
			"pattern":     pattern,
			"durationSec": durationSec,
		}
		if v := req.GetString("transaction_type", ""); v != "" {
			payload["transactionType"] = v
		}
		if v := req.GetInt("num_accounts", 0); v > 0 {
			payload["numAccounts"] = v
		}
		if v := req.GetInt("constant_rate", 0); v > 0 {
			payload["constantRate"] = v
		}
		if v := req.GetInt("ramp_start", 0); v > 0 {
			payload["rampStart"] = v
		}
		if v := req.GetInt("ramp_end", 0); v > 0 {
			payload["rampEnd"] = v
		}
		if v := req.GetInt("ramp_steps", 0); v > 0 {
			payload["rampSteps"] = v
		}
		if v := req.GetInt("baseline_rate", 0); v > 0 {
			payload["baselineRate"] = v
		}
		if v := req.GetInt("spike_rate", 0); v > 0 {
			payload["spikeRate"] = v
		}
		if v := req.GetInt("spike_duration", 0); v > 0 {
			payload["spikeDuration"] = v
		}
		if v := req.GetInt("spike_interval", 0); v > 0 {
			payload["spikeInterval"] = v
		}
		if v := req.GetInt("adaptive_initial_rate", 0); v > 0 {
			payload["adaptiveInitialRate"] = v
		}

		// Build realisticConfig for realistic/adaptive-realistic patterns
		if pattern == "realistic" || pattern == "adaptive-realistic" {
			rc := map[string]any{
				"targetTps":       req.GetInt("realistic_target_tps", 50),
				"minTipGwei":      req.GetFloat("realistic_min_tip_gwei", 1.0),
				"maxTipGwei":      req.GetFloat("realistic_max_tip_gwei", 100.0),
				"tipDistribution": req.GetString("realistic_tip_distribution", "exponential"),
				"txTypeRatios": map[string]any{
					"ethTransfer":   40,
					"erc20Transfer": 25,
					"erc20Approve":  10,
					"uniswapSwap":   10,
					"storageWrite":  10,
					"heavyCompute":  5,
				},
			}
			if v := req.GetInt("num_accounts", 0); v > 0 {
				rc["numAccounts"] = v
			}
			// When num_accounts is not specified, omit numAccounts to let
			// the load generator auto-calculate based on target TPS and block time
			payload["realisticConfig"] = rc
		}

		_, err = client.post("/v1/start", payload)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Start test failed: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Test Started"),
			kvf("Pattern", pattern),
			kvf("Duration", fmt.Sprintf("%ds", durationSec)),
		)), nil
	})
}

func registerLoadgenStop(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_stop",
		mcp.WithDescription("Stop the currently running load test. MUTATING."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		_, err := client.post("/v1/stop", nil)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Stop failed: %v", err)), nil
		}
		return mcp.NewToolResultText(sectionf("Test Stopped")), nil
	})
}

func registerLoadgenReset(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_reset",
		mcp.WithDescription("Reset the load generator to idle state. MUTATING."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		_, err := client.post("/v1/reset", nil)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Reset failed: %v", err)), nil
		}
		return mcp.NewToolResultText(sectionf("Load Generator Reset")), nil
	})
}

func registerLoadgenRecycle(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_recycle",
		mcp.WithDescription("Recycle funds from dynamic test accounts back to faucets. MUTATING."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.post("/v1/recycle", nil)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Recycle failed: %v", err)), nil
		}
		var result map[string]any
		json.Unmarshal(raw, &result)
		return mcp.NewToolResultText(joinLines(
			sectionf("Funds Recycled"),
			kvf("Status", getString(result, "status")),
			kvf("Recycled", formatNumber(getFloat(result, "recycled"))),
		)), nil
	})
}

func registerLoadgenHistory(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_history",
		mcp.WithDescription("List completed test runs with summary metrics."),
		mcp.WithNumber("limit", mcp.Description("Max results (default: 10)")),
		mcp.WithNumber("offset", mcp.Description("Offset for pagination")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		limit := req.GetInt("limit", 10)
		offset := req.GetInt("offset", 0)
		raw, err := client.get(fmt.Sprintf("/v1/history?limit=%d&offset=%d", limit, offset))
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("History failed: %v", err)), nil
		}
		return mcp.NewToolResultText(fmtLoadgenHistory(raw)), nil
	})
}

func registerLoadgenTestDetail(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_test_detail",
		mcp.WithDescription("Get detailed results for a specific test run."),
		mcp.WithString("id", mcp.Required(), mcp.Description("Test run ID")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := req.RequireString("id")
		if err != nil {
			return mcp.NewToolResultError("id is required"), nil
		}
		// Use /history/ (not /v1/history/) — the loadgen handler's TrimPrefix
		// expects the path to start with /history/, which fails with the /v1/ prefix.
		raw, err := client.get("/history/" + id)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Test detail failed: %v", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		run, _ := m["run"].(map[string]any)
		if run == nil {
			return mcp.NewToolResultError("Test run not found"), nil
		}
		lines := joinLines(
			sectionf("Test Run: "+id),
			kvf("Pattern", getString(run, "pattern")),
			kvf("TX Type", getString(run, "transactionType")),
			kvf("Duration", fmt.Sprintf("%.0fs", getFloat(run, "durationMs")/1000)),
			kvf("TXs Sent", formatNumber(getFloat(run, "txSent"))),
			kvf("TXs Confirmed", formatNumber(getFloat(run, "txConfirmed"))),
			kvf("TXs Failed", formatNumber(getFloat(run, "txFailed"))),
			kvf("Avg TPS", fmt.Sprintf("%.0f", getFloat(run, "averageTps"))),
			kvf("Peak TPS", fmt.Sprintf("%.0f", getFloat(run, "peakTps"))),
		)
		if lat, ok := run["latencyStats"].(map[string]any); ok {
			lines += "\n\n" + joinLines(
				sectionf("Latency"),
				kvf("Min", formatMs(getFloat(lat, "min"))),
				kvf("Avg", formatMs(getFloat(lat, "avg"))),
				kvf("P50", formatMs(getFloat(lat, "p50"))),
				kvf("P75", formatMs(getFloat(lat, "p75"))),
				kvf("P90", formatMs(getFloat(lat, "p90"))),
				kvf("P95", formatMs(getFloat(lat, "p95"))),
				kvf("P99", formatMs(getFloat(lat, "p99"))),
				kvf("Max", formatMs(getFloat(lat, "max"))),
			)
		}
		return mcp.NewToolResultText(lines), nil
	})
}

func registerLoadgenTestTxs(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_test_txs",
		mcp.WithDescription("Get transaction logs for a specific test run."),
		mcp.WithString("id", mcp.Required(), mcp.Description("Test run ID")),
		mcp.WithNumber("limit", mcp.Description("Max transactions (default: 50)")),
		mcp.WithNumber("offset", mcp.Description("Offset for pagination")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := req.RequireString("id")
		if err != nil {
			return mcp.NewToolResultError("id is required"), nil
		}
		limit := req.GetInt("limit", 50)
		offset := req.GetInt("offset", 0)
		raw, err := client.get(fmt.Sprintf("/history/%s/transactions?limit=%d&offset=%d", id, limit, offset))
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Test transactions failed: %v", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		total := getFloat(m, "total")
		return mcp.NewToolResultText(joinLines(
			sectionf("Transaction Logs"),
			kvf("Total", formatNumber(total)),
		)), nil
	})
}

func registerLoadgenDeleteRun(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("loadgen_delete_run",
		mcp.WithDescription("Delete a test run and its transaction logs. MUTATING."),
		mcp.WithString("id", mcp.Required(), mcp.Description("Test run ID to delete")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := req.RequireString("id")
		if err != nil {
			return mcp.NewToolResultError("id is required"), nil
		}
		_, err = client.delete("/history/" + id)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Delete failed: %v", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Test Run Deleted"),
			kvf("ID", id),
		)), nil
	})
}

// Formatting helpers

func fmtLoadgenStatus(raw json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return fmt.Sprintf("Error parsing status: %v", err)
	}

	lines := joinLines(
		sectionf("Load Generator Status"),
		kvf("Status", getString(m, "status")),
		kvf("Pattern", getString(m, "pattern")),
		kvf("TX Type", getString(m, "transactionType")),
		kvf("TXs Sent", formatNumber(getFloat(m, "txSent"))),
		kvf("TXs Confirmed", formatNumber(getFloat(m, "txConfirmed"))),
		kvf("TXs Failed", formatNumber(getFloat(m, "txFailed"))),
		kvf("Current TPS", fmt.Sprintf("%.0f", getFloat(m, "currentTps"))),
		kvf("Average TPS", fmt.Sprintf("%.0f", getFloat(m, "averageTps"))),
		kvf("Elapsed", fmt.Sprintf("%.1fs / %.1fs", getFloat(m, "elapsedMs")/1000, getFloat(m, "durationMs")/1000)),
	)

	if lat, ok := m["latency"].(map[string]any); ok {
		lines += "\n\n" + joinLines(
			sectionf("Confirmation Latency"),
			kvf("P50", formatMs(getFloat(lat, "p50"))),
			kvf("P95", formatMs(getFloat(lat, "p95"))),
			kvf("P99", formatMs(getFloat(lat, "p99"))),
		)
	}

	return lines
}

func fmtLoadgenHistory(raw json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return fmt.Sprintf("Error parsing history: %v", err)
	}

	total := getFloat(m, "total")
	lines := joinLines(
		sectionf("Test History"),
		kvf("Total Runs", formatNumber(total)),
		"",
	)

	runs, ok := m["runs"].([]any)
	if !ok || len(runs) == 0 {
		lines += "No test runs found."
		return lines
	}

	for _, r := range runs {
		run, ok := r.(map[string]any)
		if !ok {
			continue
		}
		id := getString(run, "id")
		pattern := getString(run, "pattern")
		txSent := getFloat(run, "txSent")
		avgTPS := getFloat(run, "averageTps")
		startedAt := getString(run, "startedAt")
		t, err := time.Parse(time.RFC3339Nano, startedAt)
		started := startedAt
		if err == nil {
			started = t.Format("2006-01-02 15:04:05")
		}

		lines += fmt.Sprintf("### %s\n", id)
		lines += joinLines(
			kvf("Pattern", pattern),
			kvf("TXs Sent", formatNumber(txSent)),
			kvf("Avg TPS", fmt.Sprintf("%.0f", avgTPS)),
			kvf("Started", started),
		)
		lines += "\n\n"
	}

	return lines
}
