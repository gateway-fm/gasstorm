package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerStackTools registers Docker Compose stack management tools.
func registerStackTools(s *server.MCPServer, gasstormDir string) {
	registerStackStatus(s, gasstormDir)
	registerStackUp(s, gasstormDir)
	registerStackDown(s, gasstormDir)
	registerStackRestart(s, gasstormDir)
	registerStackLogs(s, gasstormDir)
	registerStackConfig(s, gasstormDir)
	registerStackConfigSet(s, gasstormDir)
}

func registerStackStatus(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_status",
		mcp.WithDescription("Show Docker Compose service states and ports for the GasStorm stack."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		out, err := runCompose(dir, "ps", "--format", "table")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_status failed: %v\n\nIs Docker running?", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Status"),
			out,
		)), nil
	})
}

func registerStackUp(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_up",
		mcp.WithDescription("Start the GasStorm stack with a profile. MUTATING."),
		mcp.WithString("profile",
			mcp.Description("Docker Compose profile: reth (default), cdk-erigon, gravity-reth"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		profile := req.GetString("profile", "reth")
		out, err := runCompose(dir, "--profile", profile, "up", "-d")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_up failed: %v\n%s", err, out)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Started"),
			kvf("Profile", profile),
			"",
			out,
		)), nil
	})
}

func registerStackDown(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_down",
		mcp.WithDescription("Stop the GasStorm stack. MUTATING."),
		mcp.WithBoolean("volumes",
			mcp.Description("Also remove volumes (default: false)"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := []string{"down"}
		if req.GetBool("volumes", false) {
			args = append(args, "-v")
		}
		out, err := runCompose(dir, args...)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_down failed: %v\n%s", err, out)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Stopped"),
			out,
		)), nil
	})
}

func registerStackRestart(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_restart",
		mcp.WithDescription("Restart a specific service or all services. MUTATING."),
		mcp.WithString("service",
			mcp.Description("Service name to restart (e.g., block-builder, load-generator). If empty, restarts all."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		svc := req.GetString("service", "")
		args := []string{"restart"}
		if svc != "" {
			args = append(args, svc)
		}
		out, err := runCompose(dir, args...)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_restart failed: %v\n%s", err, out)), nil
		}
		target := "all services"
		if svc != "" {
			target = svc
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Restarted"),
			kvf("Service", target),
			"",
			out,
		)), nil
	})
}

func registerStackLogs(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_logs",
		mcp.WithDescription("Get recent logs for a service."),
		mcp.WithString("service",
			mcp.Required(),
			mcp.Description("Service name (e.g., block-builder, load-generator, l2-reth)"),
		),
		mcp.WithNumber("lines",
			mcp.Description("Number of lines to tail (default: 50)"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		svc, err := req.RequireString("service")
		if err != nil {
			return mcp.NewToolResultError("service is required"), nil
		}
		lines := req.GetInt("lines", 50)
		out, err := runCompose(dir, "logs", "--tail", fmt.Sprintf("%d", lines), "--no-color", svc)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_logs failed: %v\n%s", err, out)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Logs: "+svc),
			out,
		)), nil
	})
}

func registerStackConfig(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_config",
		mcp.WithDescription("Read current .env configuration values for the GasStorm stack."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		envPath := filepath.Join(dir, ".env")
		data, err := os.ReadFile(envPath)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Cannot read .env: %v\n\nCopy .env.example to .env first.", err)), nil
		}

		lines := sectionf("Stack Configuration") + "\n"
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			lines += kvf(strings.SplitN(line, "=", 2)[0], strings.SplitN(line, "=", 2)[1]) + "\n"
		}
		return mcp.NewToolResultText(lines), nil
	})
}

func registerStackConfigSet(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_config_set",
		mcp.WithDescription("Update a .env value. Requires service restart to take effect. MUTATING."),
		mcp.WithString("key",
			mcp.Required(),
			mcp.Description("Configuration key (e.g., BLOCK_TIME_MS, GAS_LIMIT)"),
		),
		mcp.WithString("value",
			mcp.Required(),
			mcp.Description("New value"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		key, err := req.RequireString("key")
		if err != nil {
			return mcp.NewToolResultError("key is required"), nil
		}
		value, err := req.RequireString("value")
		if err != nil {
			return mcp.NewToolResultError("value is required"), nil
		}

		envPath := filepath.Join(dir, ".env")
		data, err := os.ReadFile(envPath)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Cannot read .env: %v", err)), nil
		}

		// Replace or append the key
		found := false
		var result []string
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := scanner.Text()
			trimmed := strings.TrimSpace(line)
			if !strings.HasPrefix(trimmed, "#") && strings.HasPrefix(trimmed, key+"=") {
				result = append(result, key+"="+value)
				found = true
			} else {
				result = append(result, line)
			}
		}
		if !found {
			result = append(result, key+"="+value)
		}

		if err := os.WriteFile(envPath, []byte(strings.Join(result, "\n")+"\n"), 0644); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Writing .env failed: %v", err)), nil
		}

		return mcp.NewToolResultText(joinLines(
			sectionf("Configuration Updated"),
			kvf("Key", key),
			kvf("Value", value),
			"",
			"Restart affected services for changes to take effect.",
		)), nil
	})
}

// runCompose runs a docker compose command in the gasstorm directory.
func runCompose(dir string, args ...string) (string, error) {
	cmdArgs := append([]string{"compose"}, args...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := stdout.String()
	if output == "" {
		output = stderr.String()
	}
	return strings.TrimSpace(output), err
}
