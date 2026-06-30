package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// maxResponseBody bounds how much of a response we read into memory.
const maxResponseBody = 10 << 20 // 10 MiB

// httpClient is a thin HTTP + JSON-RPC client for service communication.
type httpClient struct {
	baseURL    *url.URL
	httpClient *http.Client
}

func newHTTPClient(baseURL string) *httpClient {
	c, err := newHTTPClientChecked(baseURL)
	if err != nil {
		panic(err)
	}
	return c
}

// newHTTPClientChecked parses and validates the operator-supplied base URL.
// The base URL comes from configuration (env vars), not from request input;
// validating the scheme here and joining paths via (*url.URL).JoinPath below
// ensures that per-request paths (some of which interpolate user-supplied
// values) cannot smuggle a different host or scheme into the request target.
func newHTTPClientChecked(baseURL string) (*httpClient, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid base URL %q: %w", baseURL, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("base URL must be http or https, got %q", u.Scheme)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("base URL must include a host: %q", baseURL)
	}
	return &httpClient{
		baseURL: u,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}, nil
}

// target builds an absolute request URL by joining path (and an optional query
// string) onto the validated base URL. Because the host and scheme are taken
// from the parsed base URL and never from path, this is safe against path-based
// host/scheme injection.
func (c *httpClient) target(path string) string {
	rawPath, rawQuery, hasQuery := strings.Cut(path, "?")
	u := c.baseURL.JoinPath(rawPath)
	if hasQuery {
		u.RawQuery = rawQuery
	}
	return u.String()
}

func readBody(resp *http.Response) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBody))
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}
	return body, nil
}

// get performs a GET request and returns the raw JSON body.
func (c *httpClient) get(path string) (json.RawMessage, error) {
	resp, err := c.httpClient.Get(c.target(path))
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readBody(resp)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return json.RawMessage(body), nil
}

// post performs a POST request with optional JSON body.
func (c *httpClient) post(path string, payload any) (json.RawMessage, error) {
	var bodyReader io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("marshaling request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	resp, err := c.httpClient.Post(c.target(path), "application/json", bodyReader)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readBody(resp)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return json.RawMessage(body), nil
}

// delete performs a DELETE request.
func (c *httpClient) delete(path string) (json.RawMessage, error) {
	req, err := http.NewRequest(http.MethodDelete, c.target(path), nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := readBody(resp)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return json.RawMessage(body), nil
}

// jsonRPCRequest is a JSON-RPC 2.0 request.
type jsonRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
	ID      int    `json:"id"`
}

// jsonRPCResponse is a JSON-RPC 2.0 response.
type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
	ID      int             `json:"id"`
}

// jsonRPCError is a JSON-RPC 2.0 error.
type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// rpcCall performs a JSON-RPC call.
func (c *httpClient) rpcCall(method string, params ...any) (json.RawMessage, error) {
	if params == nil {
		params = []any{}
	}
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      1,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	resp, err := c.httpClient.Post(c.target("/"), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := readBody(resp)
	if err != nil {
		return nil, err
	}

	var rpcResp jsonRPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("parsing JSON-RPC response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}
