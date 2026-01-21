// Package main is the entry point for the ZisK prover service.
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gateway/sequencer-poc/zisk-prover/internal/api"
	"github.com/gateway/sequencer-poc/zisk-prover/internal/prover"
	"github.com/gateway/sequencer-poc/zisk-prover/internal/witness"
)

func main() {
	// Parse flags
	port := flag.Int("port", 3000, "HTTP server port")
	l2URL := flag.String("l2-url", "http://localhost:18545", "L2 RPC URL")
	elfPath := flag.String("elf", "", "Path to ZisK guest ELF binary")
	useEmulator := flag.Bool("emulator", true, "Use emulator instead of real prover")
	logLevel := flag.String("log-level", "info", "Log level (debug, info, warn, error)")
	flag.Parse()

	// Setup logger
	var level slog.Level
	switch *logLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: level,
	}))

	logger.Info("starting zisk-prover",
		"port", *port,
		"l2URL", *l2URL,
		"emulator", *useEmulator,
	)

	// Create witness fetcher
	witnessFetcher, err := witness.NewFetcher(*l2URL, logger)
	if err != nil {
		logger.Warn("failed to connect to L2, continuing without witness fetcher", "error", err)
		// Don't fail - allow service to start for status checks
	}

	// Create prover config
	cfg := prover.DefaultConfig()
	cfg.UseEmulator = *useEmulator
	if *elfPath != "" {
		cfg.ELFPath = *elfPath
	}

	// Create prover
	p, err := prover.New(cfg, logger)
	if err != nil {
		logger.Error("failed to create prover", "error", err)
		os.Exit(1)
	}
	defer p.Close()

	// Create API server
	server := api.NewServer(p, witnessFetcher, logger)

	// Start HTTP server
	addr := fmt.Sprintf(":%d", *port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: server.Handler(),
	}

	// Handle shutdown
	done := make(chan struct{})
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		logger.Info("shutting down...")
		if err := httpServer.Close(); err != nil {
			logger.Error("failed to close HTTP server", "error", err)
		}
		if witnessFetcher != nil {
			witnessFetcher.Close()
		}
		close(done)
	}()

	logger.Info("zisk-prover ready", "addr", addr)

	if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
		logger.Error("HTTP server error", "error", err)
		os.Exit(1)
	}

	<-done
	logger.Info("zisk-prover stopped")
}
