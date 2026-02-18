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
		mcp.WithBoolean("bridge",
			mcp.Description("Enable Hyperlane bridge infrastructure profile. Defaults to true for reth, false otherwise."),
		),
		mcp.WithBoolean("bridge_ui",
			mcp.Description("Enable Hyperlane Warp UI profile (bridge-ui). Defaults to false."),
		),
		mcp.WithBoolean("blob",
			mcp.Description("Enable Blob DA profile. Defaults to true for reth, false otherwise."),
		),
		mcp.WithBoolean("metal",
			mcp.Description("Start in Metal mode (no Docker). Requires op-reth, Go, Node.js, and sibling repos."),
		),
		mcp.WithBoolean("gasless",
			mcp.Description("Enable gasless mode (0 base fee, 0 gas price). Restart required to take effect if already running."),
		),
	)
	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if req.GetBool("metal", false) {
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

		profile := req.GetString("profile", "reth")
		gasless := req.GetBool("gasless", false)
		enableBridge := req.GetBool("bridge", profile == "reth")
		enableBridgeUI := req.GetBool("bridge_ui", false)
		enableBlob := req.GetBool("blob", profile == "reth")

		profiles := []string{profile}
		if profile == "reth" && enableBridge {
			profiles = append(profiles, "bridge")
		}
		if profile == "reth" && enableBridgeUI {
			profiles = append(profiles, "bridge-ui")
		}
		if profile == "reth" && enableBlob {
			profiles = append(profiles, "blob")
		}

		args := []string{}
		for _, p := range profiles {
			args = append(args, "--profile", p)
		}
		if gasless {
			args = append(args, "-f", "docker-compose.yml", "-f", "docker-compose-op-reth.yaml", "-f", "docker-compose-gasless.yaml")
		}
		args = append(args, "up", "-d")

		// Note: when using -f overrides, we must specify all base files if we deviate from default behavior.
		// However, runCompose appends 'compose' + args. Standard usage often just relies on COMPOSE_FILE env or default.
		// If gasless is false, we just use defaults. If true, we need to be careful about which files to include.
		// docker-compose.yml is base. docker-compose-op-reth.yaml is the profile logic usually activated by profile name?
		// Actually, profiles are in the service definitions. We just need to add the override file if gasless.
		// But docker compose merging rules require specifying the base file if you specify -f.

		// If gasless is active, we reconstruct the file list explicitly to be safe + the override.
		// Standard set usually implicitly picks up docker-compose.yml and docker-compose.override.yml

		if gasless {
			// Reset args to be explicit about files
			args = []string{}
			for _, p := range profiles {
				args = append(args, "--profile", p)
			}
			args = append(args, "-f", "docker-compose.yml", "-f", "docker-compose-op-reth.yaml", "-f", "docker-compose-gasless.yaml", "up", "-d")
		}

		out, err := runCompose(dir, args...)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("stack_up failed: %v\n%s", err, out)), nil
		}

		statusMsg := fmt.Sprintf("Profiles: %s", strings.Join(profiles, ", "))
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
