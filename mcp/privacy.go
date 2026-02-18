package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerPrivacyTools registers privacy proxy tools on the MCP server.
func registerPrivacyTools(s *server.MCPServer, client *httpClient) {
	registerPrivacyHealth(s, client)
	registerPrivacyStatus(s, client)
	registerPrivacyOrgs(s, client)
	registerPrivacyLogs(s, client)
}

func registerPrivacyHealth(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("privacy_health",
		mcp.WithDescription("Check if the privacy proxy is reachable."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/health")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Privacy proxy unreachable: %v\n\nIs the proxy running? Try: make run-with-privacy", err)), nil
		}
		var m map[string]any
		json.Unmarshal(raw, &m)
		return mcp.NewToolResultText(joinLines(
			sectionf("Privacy Proxy Health: OK"),
			kvf("Status", getString(m, "status")),
		)), nil
	})
}

func registerPrivacyStatus(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("privacy_status",
		mcp.WithDescription("Get privacy proxy status: proxy state, node connectivity, and security config."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/api/v1/status")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Privacy status failed: %v", err)), nil
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing status: %v", err)), nil
		}

		lines := sectionf("Privacy Proxy Status") + "\n"

		if proxy, ok := m["proxy"].(map[string]any); ok {
			lines += joinLines(
				kvf("Proxy Status", getString(proxy, "status")),
				kvf("Proxy Port", getString(proxy, "port")),
			) + "\n"
		}

		if node, ok := m["node"].(map[string]any); ok {
			lines += joinLines(
				kvf("Node Status", getString(node, "status")),
				kvf("Node URL", getString(node, "url")),
				kvf("Node Latency", fmt.Sprintf("%dms", int64(getFloat(node, "latency_ms")))),
			) + "\n"
		}

		if sec, ok := m["security"].(map[string]any); ok {
			lines += kvf("Runtime Tracing", boolYesNo(getBool(sec, "runtime_tracing_enabled")))
		}

		return mcp.NewToolResultText(lines), nil
	})
}

func registerPrivacyOrgs(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("privacy_orgs",
		mcp.WithDescription("List organizations configured in the privacy proxy."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		raw, err := client.get("/api/v1/orgs")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Privacy orgs failed: %v", err)), nil
		}
		var orgs []any
		if err := json.Unmarshal(raw, &orgs); err != nil {
			// Try as object with array field
			var m map[string]any
			if err2 := json.Unmarshal(raw, &m); err2 != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Parsing orgs: %v", err)), nil
			}
			pretty, _ := json.MarshalIndent(m, "", "  ")
			return mcp.NewToolResultText(joinLines(
				sectionf("Organizations"),
				string(pretty),
			)), nil
		}

		lines := sectionf("Organizations") + "\n"
		if len(orgs) == 0 {
			lines += "No organizations configured."
			return mcp.NewToolResultText(lines), nil
		}
		for _, o := range orgs {
			org, ok := o.(map[string]any)
			if !ok {
				continue
			}
			lines += fmt.Sprintf("\n### %s\n", getString(org, "name"))
			lines += joinLines(
				kvf("ID", getString(org, "id")),
				kvf("Slug", getString(org, "slug")),
			) + "\n"
		}
		return mcp.NewToolResultText(lines), nil
	})
}

func registerPrivacyLogs(s *server.MCPServer, client *httpClient) {
	tool := mcp.NewTool("privacy_logs",
		mcp.WithDescription("Get recent access logs from the privacy proxy."),
		mcp.WithNumber("limit", mcp.Description("Max log entries (default: 50)")),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		limit := req.GetInt("limit", 50)
		raw, err := client.get(fmt.Sprintf("/api/v1/logs?limit=%d", limit))
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Privacy logs failed: %v", err)), nil
		}
		var logs []any
		if err := json.Unmarshal(raw, &logs); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Parsing logs: %v", err)), nil
		}

		lines := joinLines(
			sectionf("Access Logs"),
			kvf("Count", len(logs)),
		) + "\n"

		for i, l := range logs {
			if i >= 10 {
				lines += fmt.Sprintf("\n... and %d more entries", len(logs)-10)
				break
			}
			entry, ok := l.(map[string]any)
			if !ok {
				continue
			}
			lines += fmt.Sprintf("\n%s %s %s → %d",
				getString(entry, "timestamp"),
				getString(entry, "identity"),
				getString(entry, "method"),
				int64(getFloat(entry, "status_code")),
			)
		}
		return mcp.NewToolResultText(lines), nil
	})
}
