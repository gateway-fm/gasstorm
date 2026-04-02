package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// registerStackTools registers Docker Compose and Metal mode stack management tools.
func registerStackTools(s *server.MCPServer, gasstormDir string) {
	registerStackStatus(s, gasstormDir)
	registerStackUp(s, gasstormDir)
	registerStackDown(s, gasstormDir)
	registerStackRestart(s, gasstormDir)
	registerStackLogs(s, gasstormDir)
	registerStackConfig(s, gasstormDir)
	registerStackConfigSet(s, gasstormDir)
}

// metalPidDir returns the path to the metal mode PID directory.
func metalPidDir(dir string) string {
	return filepath.Join(dir, "data", "metal", "pids")
}

// metalLogDir returns the path to the metal mode log directory.
func metalLogDir(dir string) string {
	return filepath.Join(dir, "data", "metal", "logs")
}

// metalServices lists all metal mode services and their PID file names.
var metalServices = []string{"l1", "reth", "blockbuilder", "loadgen", "dashboard"}

// isMetalMode checks if the stack is running in metal mode by looking for
// a live reth process tracked via PID file.
func isMetalMode(dir string) bool {
	pidFile := filepath.Join(metalPidDir(dir), "reth.pid")
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return false
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return false
	}
	// Check if process is alive (signal 0 doesn't kill, just checks)
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

// metalServiceStatus returns status info for a single metal mode service.
func metalServiceStatus(dir, svc string) string {
	pidFile := filepath.Join(metalPidDir(dir), svc+".pid")
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return fmt.Sprintf("%-15s stopped (no PID file)", svc)
	}
	pidStr := strings.TrimSpace(string(data))
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return fmt.Sprintf("%-15s stopped (invalid PID)", svc)
	}
	proc, err := os.FindProcess(pid)
	if err != nil || proc.Signal(syscall.Signal(0)) != nil {
		return fmt.Sprintf("%-15s stopped (PID %d not running)", svc, pid)
	}

	// Get uptime via ps
	cmd := exec.Command("ps", "-o", "etime=", "-p", pidStr)
	out, err := cmd.Output()
	uptime := "unknown"
	if err == nil {
		uptime = strings.TrimSpace(string(out))
	}
	return fmt.Sprintf("%-15s running  PID %-8d uptime %s", svc, pid, uptime)
}

func registerStackStatus(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_status",
		mcp.WithDescription("Show service states and ports for the GasStorm stack (auto-detects Docker or Metal mode)."),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if isMetalMode(dir) {
			lines := []string{
				sectionf("Stack Status (Metal Mode)"),
				"",
			}
			for _, svc := range metalServices {
				lines = append(lines, metalServiceStatus(dir, svc))
			}
			return mcp.NewToolResultText(strings.Join(lines, "\n")), nil
		}

		out, err := runCompose(dir, "ps", "--format", "table")
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_status failed: %v\n\nIs Docker running?", err)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Status (Docker)"),
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
		mcp.WithString("with",
			mcp.Description("Optional features (comma-separated): blob, privacy, explorer, bridge, bridge-ui. Defaults: reth=blob,privacy,explorer; others=privacy,explorer."),
		),
		mcp.WithBoolean("bridge",
			mcp.Description("Legacy flag: include bridge profile."),
		),
		mcp.WithBoolean("bridge_ui",
			mcp.Description("Legacy flag: include bridge-ui profile."),
		),
		mcp.WithBoolean("blob",
			mcp.Description("Legacy flag: include blob profile."),
		),
		mcp.WithString("l1",
			mcp.Description("L1 backend: anvil (default) or besu (Clique PoA)."),
			mcp.Enum("anvil", "besu"),
		),
		mcp.WithBoolean("metal",
			mcp.Description("Start in Metal mode (no Docker). Requires op-reth, Go, Node.js, and sibling repos."),
		),
		mcp.WithBoolean("gasless",
			mcp.Description("Enable gasless mode (0 base fee, 0 gas price). Restart required to take effect if already running."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		profile := req.GetString("profile", "reth")
		l1 := req.GetString("l1", "anvil")
		gasless := req.GetBool("gasless", false)
		withRaw := strings.TrimSpace(req.GetString("with", ""))
		legacyBridge := req.GetBool("bridge", false)
		legacyBridgeUI := req.GetBool("bridge_ui", false)
		legacyBlob := req.GetBool("blob", false)

		if req.GetBool("metal", false) {
			if withRaw != "" || legacyBridge || legacyBridgeUI || legacyBlob {
				return mcp.NewToolResultError("MODE=metal supports core services only. Use Docker mode for optional features (blob/privacy/explorer/bridge)."), nil
			}
			out, err := runScript(dir, "scripts/run-metal.sh")
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Metal mode start failed: %v\n%s\n\nUse `make run-metal` for interactive mode.", err, out)), nil
			}
			return mcp.NewToolResultText(joinLines(
				sectionf("Stack Started (Metal Mode)"),
				out,
			)), nil
		}

		if isMetalMode(dir) {
			return mcp.NewToolResultError("Stack is running in Metal mode. Use stack_down first, or use `make stop-metal` to stop."), nil
		}

		if withRaw == "" {
			if profile == "reth" {
				withRaw = "blob,privacy,explorer"
			} else {
				withRaw = "privacy,explorer"
			}
		}

		features, err := parseWithFeatures(withRaw)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if legacyBridge {
			features["bridge"] = true
		}
		if legacyBridgeUI {
			features["bridge-ui"] = true
		}
		if legacyBlob {
			features["blob"] = true
		}

		if features["bridge-ui"] && !features["bridge"] {
			return mcp.NewToolResultError("Feature 'bridge-ui' requires 'bridge'."), nil
		}

		if gasless && profile != "reth" {
			return mcp.NewToolResultError("Gasless mode is only supported with profile=reth."), nil
		}

		profiles := []string{}
		addProfile := func(p string) {
			for _, existing := range profiles {
				if existing == p {
					return
				}
			}
			profiles = append(profiles, p)
		}

		addProfile(profile)

		extraProfiles, err := resolveOptionalProfiles(profile, features)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		for _, p := range extraProfiles {
			addProfile(p)
		}

		// Collect compose overlay files. When any overlay is used,
		// docker-compose.yml must be specified as the base file.
		var composeFiles []string

		if l1 == "besu" {
			if features["blob"] {
				return mcp.NewToolResultError("Feature 'blob' requires EIP-4844 (Besu Clique doesn't support Cancun). Use L1=anvil."), nil
			}
			composeFiles = append(composeFiles, "docker-compose-besu-l1.yaml")
		}

		if features["bridge"] && profile == "cdk-erigon" {
			if l1 == "besu" {
				composeFiles = append(composeFiles, "docker-compose-besu-cdk-erigon-bridge.yaml")
			} else {
				composeFiles = append(composeFiles, "docker-compose-cdk-erigon-bridge.yaml")
			}
		}

		if features["privacy"] && features["explorer"] {
			if profile == "cdk-erigon" {
				composeFiles = append(composeFiles, "docker-compose-privacy-explorer-cdk.yaml")
			} else {
				composeFiles = append(composeFiles, "docker-compose-privacy-explorer.yaml")
			}
		}

		if gasless {
			composeFiles = append(composeFiles, "docker-compose-op-reth.yaml", "docker-compose-gasless.yaml")
		}

		// Build compose args: profiles, then file overrides, then command.
		args := []string{}
		for _, p := range profiles {
			args = append(args, "--profile", p)
		}
		if len(composeFiles) > 0 {
			args = append(args, "-f", "docker-compose.yml")
			for _, f := range composeFiles {
				args = append(args, "-f", f)
			}
		}
		args = append(args, "up", "-d")

		// Set BRIDGE_L2_RPC for cdk-erigon bridge (different container hostname).
		env := map[string]string{}
		if features["bridge"] && profile == "cdk-erigon" {
			env["BRIDGE_L2_RPC"] = "http://l2-cdk-erigon:8545"
		}

		out, err := runComposeWithEnv(dir, env, args...)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_up failed: %v\n%s", err, out)), nil
		}

		statusMsg := fmt.Sprintf("Profiles: %s", strings.Join(profiles, ", "))
		statusMsg += fmt.Sprintf(" | Features: %s", withRaw)
		if l1 != "anvil" {
			statusMsg += fmt.Sprintf(" | L1: %s", l1)
		}
		if gasless {
			statusMsg += " (Gasless Mode Enabled)"
		}

		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Started (Docker)"),
			statusMsg,
			"",
			out,
		)), nil
	})
}

func parseWithFeatures(withRaw string) (map[string]bool, error) {
	features := map[string]bool{}
	if strings.TrimSpace(withRaw) == "" {
		return features, nil
	}

	for _, token := range strings.Split(withRaw, ",") {
		feature := strings.ToLower(strings.TrimSpace(token))
		switch feature {
		case "":
			continue
		case "bridge_ui":
			features["bridge-ui"] = true
		case "blob", "privacy", "explorer", "bridge", "bridge-ui":
			features[feature] = true
		default:
			return nil, fmt.Errorf("unknown feature '%s'. Valid: blob, privacy, explorer, bridge, bridge-ui", feature)
		}
	}

	return features, nil
}

func resolveOptionalProfiles(profile string, features map[string]bool) ([]string, error) {
	if profile != "reth" && profile != "cdk-erigon" && profile != "gravity-reth" {
		return nil, fmt.Errorf("unsupported profile '%s'. Valid: reth, cdk-erigon, gravity-reth", profile)
	}

	profiles := []string{}
	add := func(p string) {
		for _, existing := range profiles {
			if existing == p {
				return
			}
		}
		profiles = append(profiles, p)
	}

	if features["blob"] {
		switch profile {
		case "reth":
			add("blob")
		case "cdk-erigon":
			add("blob-cdk")
		default:
			return nil, fmt.Errorf("feature 'blob' is only supported with profile=reth or profile=cdk-erigon")
		}
	}

	if features["privacy"] {
		if profile == "cdk-erigon" {
			add("privacy-cdk")
		} else {
			add("privacy")
		}
	}

	if features["explorer"] {
		if profile == "cdk-erigon" {
			add("explorer-cdk")
		} else {
			add("explorer")
		}
		add("explorer-l1")
	}

	if features["bridge"] {
		if profile != "reth" && profile != "cdk-erigon" {
			return nil, fmt.Errorf("feature 'bridge' requires profile=reth or profile=cdk-erigon")
		}
		add("bridge")
	}

	if features["bridge-ui"] {
		if profile != "reth" && profile != "cdk-erigon" {
			return nil, fmt.Errorf("feature 'bridge-ui' requires profile=reth or profile=cdk-erigon")
		}
		add("bridge-ui")
	}

	return profiles, nil
}

func registerStackDown(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_down",
		mcp.WithDescription("Stop the GasStorm stack (auto-detects Docker or Metal mode). MUTATING."),
		mcp.WithBoolean("volumes",
			mcp.Description("Also remove volumes (Docker mode only, default: false)"),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if isMetalMode(dir) {
			out, err := runScript(dir, "scripts/stop-metal.sh")
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Metal stop failed: %v\n%s", err, out)), nil
			}
			return mcp.NewToolResultText(joinLines(
				sectionf("Stack Stopped (Metal Mode)"),
				out,
			)), nil
		}

		args := []string{"down"}
		if req.GetBool("volumes", false) {
			args = append(args, "-v")
		}
		out, err := runCompose(dir, args...)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_down failed: %v\n%s", err, out)), nil
		}
		return mcp.NewToolResultText(joinLines(
			sectionf("Stack Stopped (Docker)"),
			out,
		)), nil
	})
}

func registerStackRestart(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_restart",
		mcp.WithDescription("Restart a specific service or all services (auto-detects Docker or Metal mode). MUTATING."),
		mcp.WithString("service",
			mcp.Description("Service name to restart (e.g., block-builder, load-generator). If empty, restarts all."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if isMetalMode(dir) {
			// Metal mode: stop then start
			stopOut, err := runScript(dir, "scripts/stop-metal.sh")
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Metal stop failed: %v\n%s", err, stopOut)), nil
			}
			startOut, err := runScript(dir, "scripts/run-metal.sh")
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Metal start failed: %v\n%s", err, startOut)), nil
			}
			return mcp.NewToolResultText(joinLines(
				sectionf("Stack Restarted (Metal Mode)"),
				stopOut,
				"",
				startOut,
			)), nil
		}

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
			sectionf("Stack Restarted (Docker)"),
			kvf("Service", target),
			"",
			out,
		)), nil
	})
}

func registerStackLogs(s *server.MCPServer, dir string) {
	tool := mcp.NewTool("stack_logs",
		mcp.WithDescription("Get recent logs for a service (auto-detects Docker or Metal mode)."),
		mcp.WithString("service",
			mcp.Required(),
			mcp.Description("Service name (e.g., reth, blockbuilder, loadgen, dashboard, block-builder, load-generator, l2-reth)"),
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

		if isMetalMode(dir) {
			logFile := metalLogFile(dir, svc)
			if logFile == "" {
				return mcp.NewToolResultError(fmt.Sprintf("Unknown metal service: %s\nAvailable: reth, blockbuilder, loadgen, dashboard", svc)), nil
			}

			data, err := os.ReadFile(logFile)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("Cannot read log file %s: %v", logFile, err)), nil
			}

			// Tail the last N lines
			allLines := strings.Split(string(data), "\n")
			start := len(allLines) - lines
			if start < 0 {
				start = 0
			}
			tail := strings.Join(allLines[start:], "\n")

			return mcp.NewToolResultText(joinLines(
				sectionf("Logs: "+svc+" (Metal Mode)"),
				kvf("File", logFile),
				"",
				tail,
			)), nil
		}

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

// metalLogFile maps a service name to its metal mode log file.
// Accepts both metal names (reth, blockbuilder) and Docker names (l2-reth, block-builder).
func metalLogFile(dir, svc string) string {
	logDir := metalLogDir(dir)
	// Map Docker-style service names to metal log file names
	nameMap := map[string]string{
		"l1":             "l1.log",
		"anvil":          "l1.log",
		"reth":           "reth.log",
		"l2-reth":        "reth.log",
		"op-reth":        "reth.log",
		"blockbuilder":   "blockbuilder.log",
		"block-builder":  "blockbuilder.log",
		"builder":        "blockbuilder.log",
		"loadgen":        "loadgen.log",
		"load-generator": "loadgen.log",
		"loadgenerator":  "loadgen.log",
		"dashboard":      "dashboard.log",
	}
	if fname, ok := nameMap[svc]; ok {
		return filepath.Join(logDir, fname)
	}
	return ""
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

		mode := "Docker"
		if isMetalMode(dir) {
			mode = "Metal"
		}

		cfgLines := sectionf("Stack Configuration ("+mode+" Mode)") + "\n"
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			cfgLines += kvf(strings.SplitN(line, "=", 2)[0], strings.SplitN(line, "=", 2)[1]) + "\n"
		}
		return mcp.NewToolResultText(cfgLines), nil
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
	return runComposeWithEnv(dir, nil, args...)
}

// runComposeWithEnv runs a docker compose command with extra environment variables.
func runComposeWithEnv(dir string, env map[string]string, args ...string) (string, error) {
	cmdArgs := append([]string{"compose"}, args...)
	cmd := exec.Command("docker", cmdArgs...)
	cmd.Dir = dir
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), mapToEnv(env)...)
	}

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

// mapToEnv converts a map to a slice of KEY=VALUE strings.
func mapToEnv(m map[string]string) []string {
	env := make([]string, 0, len(m))
	for k, v := range m {
		env = append(env, k+"="+v)
	}
	return env
}

// runScript runs a shell script in the gasstorm directory with a timeout.
func runScript(dir, script string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", script)
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
