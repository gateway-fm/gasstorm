// GasStorm unified MCP server.
// Re-exposes all block builder and load generator tools plus Docker Compose stack management.
package main

import (
	"fmt"
	"os"

	"github.com/mark3labs/mcp-go/server"
)

func main() {
	builderURL := os.Getenv("BUILDER_URL")
	if builderURL == "" {
		builderURL = "http://localhost:13000"
	}
	loadgenURL := os.Getenv("LOADGEN_URL")
	if loadgenURL == "" {
		loadgenURL = "http://localhost:13001"
	}
	explorerURL := os.Getenv("EXPLORER_URL")
	if explorerURL == "" {
		explorerURL = "http://localhost:18200"
	}
	privacyURL := os.Getenv("PRIVACY_URL")
	if privacyURL == "" {
		privacyURL = "http://localhost:18300"
	}
	gasstormDir := os.Getenv("GASSTORM_DIR")
	if gasstormDir == "" {
		gasstormDir = "."
	}

	s := server.NewMCPServer(
		"gasstorm",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithRecovery(),
	)

	builderClient := newHTTPClient(builderURL)
	loadgenClient := newHTTPClient(loadgenURL)
	explorerClient := newHTTPClient(explorerURL)
	privacyClient := newHTTPClient(privacyURL)

	registerBuilderTools(s, builderClient)
	registerLoadgenTools(s, loadgenClient)
	registerExplorerTools(s, explorerClient)
	registerPrivacyTools(s, privacyClient)
	registerStackTools(s, gasstormDir)

	if err := server.ServeStdio(s); err != nil {
		fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
		os.Exit(1)
	}
}
