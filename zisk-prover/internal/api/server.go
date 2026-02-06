// Package api provides the HTTP API for the ZisK prover service.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gateway-fm/gasstorm/zisk-prover/internal/prover"
	"github.com/gateway-fm/gasstorm/zisk-prover/internal/witness"
	"github.com/gateway-fm/gasstorm/zisk-prover/pkg/types"
)

const (
	serviceVersion = "0.1.0"
)

// Server handles HTTP requests for the ZisK prover.
type Server struct {
	prover    *prover.Prover
	witness   *witness.Fetcher
	logger    *slog.Logger
	startTime time.Time
}

// NewServer creates a new API server.
func NewServer(p *prover.Prover, w *witness.Fetcher, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		prover:    p,
		witness:   w,
		logger:    logger,
		startTime: time.Now(),
	}
}

// Handler returns an http.Handler with all routes configured.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// API endpoints
	mux.HandleFunc("/status", s.corsMiddleware(s.handleStatus))
	mux.HandleFunc("/prove", s.corsMiddleware(s.handleProve))
	mux.HandleFunc("/prove-stf", s.corsMiddleware(s.handleProveSTF))
	mux.HandleFunc("/proof/", s.corsMiddleware(s.handleGetProof))
	mux.HandleFunc("/proofs", s.corsMiddleware(s.handleListProofs))

	// Health endpoints
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ready", s.handleReady)

	return mux
}

func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	l2Connected := false
	if s.witness != nil {
		if err := s.witness.CheckConnection(ctx); err == nil {
			l2Connected = true
		}
	}

	resp := types.StatusResponse{
		Service:       "zisk-prover",
		Version:       serviceVersion,
		ZisKVersion:   s.prover.GetZisKVersion(),
		ProvingKey:    s.prover.HasProvingKey(),
		VerifyKey:     s.prover.HasVerifyKey(),
		L2Connected:   l2Connected,
		PendingProofs: s.prover.PendingCount(),
		TotalProofs:   s.prover.TotalCount(),
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleProve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req types.ProveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body: %v", err)
		return
	}

	if req.BlockNumber == 0 {
		s.writeError(w, http.StatusBadRequest, "blockNumber is required")
		return
	}

	s.logger.Info("prove request received", "blockNumber", req.BlockNumber)

	// Fetch block witness
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	blockWitness, err := s.witness.FetchBlock(ctx, req.BlockNumber)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "failed to fetch block: %v", err)
		return
	}

	// Submit proof job
	proofID, err := s.prover.Prove(blockWitness)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "failed to submit proof: %v", err)
		return
	}

	s.writeJSON(w, http.StatusAccepted, types.ProveResponse{ProofID: proofID})
}

// handleProveSTF handles full state transition proofs using the ZisK guest program.
func (s *Server) handleProveSTF(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req types.ProveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body: %v", err)
		return
	}

	if req.BlockNumber == 0 {
		s.writeError(w, http.StatusBadRequest, "blockNumber is required")
		return
	}

	s.logger.Info("STF prove request received", "blockNumber", req.BlockNumber)

	// Build full STF witness (with account states and transactions)
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	stfWitness, err := s.witness.BuildSTFWitness(ctx, req.BlockNumber)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "failed to build STF witness: %v", err)
		return
	}

	// Also fetch block hash for the response
	header, err := s.witness.FetchBlockHeader(ctx, req.BlockNumber)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "failed to fetch block header: %v", err)
		return
	}

	// Submit STF proof job
	proofID, err := s.prover.ProveSTF(stfWitness, header.Hash().Hex())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "failed to submit STF proof: %v", err)
		return
	}

	s.writeJSON(w, http.StatusAccepted, types.ProveResponse{ProofID: proofID})
}

func (s *Server) handleGetProof(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract proof ID from path: /proof/{id}
	proofID := strings.TrimPrefix(r.URL.Path, "/proof/")
	if proofID == "" {
		s.writeError(w, http.StatusBadRequest, "proof ID required")
		return
	}

	result, err := s.prover.GetProof(proofID)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "proof not found: %s", proofID)
		return
	}

	s.writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleListProofs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	proofs := s.prover.ListProofs()
	s.writeJSON(w, http.StatusOK, proofs)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	l2Status := "disconnected"
	if s.witness != nil {
		if err := s.witness.CheckConnection(ctx); err == nil {
			l2Status = "connected"
		}
	}

	resp := types.HealthResponse{
		Status: "ok",
		L2RPC:  l2Status,
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	// Ready if we can reach L2
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if s.witness == nil {
		http.Error(w, "witness fetcher not initialized", http.StatusServiceUnavailable)
		return
	}

	if err := s.witness.CheckConnection(ctx); err != nil {
		http.Error(w, "L2 not reachable", http.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ready"))
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		s.logger.Error("failed to encode response", "error", err)
	}
}

func (s *Server) writeError(w http.ResponseWriter, status int, format string, args ...interface{}) {
	msg := format
	if len(args) > 0 {
		msg = formatMessage(format, args...)
	}
	s.logger.Error("api error", "status", status, "message", msg)
	http.Error(w, msg, status)
}

func formatMessage(format string, args ...interface{}) string {
	// Simple format without importing fmt in hot path
	result := format
	for _, arg := range args {
		if idx := strings.Index(result, "%"); idx >= 0 {
			result = result[:idx] + toString(arg) + result[idx+2:]
		}
	}
	return result
}

func toString(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case error:
		return x.Error()
	default:
		return "<value>"
	}
}
