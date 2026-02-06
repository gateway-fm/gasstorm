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

	registerBuilderTools(s, builderClient)
	registerLoadgenTools(s, loadgenClient)
	registerStackTools(s, gasstormDir)

	if err := server.ServeStdio(s); err != nil {
		fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
		os.Exit(1)
	}
}
