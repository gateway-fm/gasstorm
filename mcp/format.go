package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

// formatNumber adds comma separators to integers.
func formatNumber(n any) string {
	var s string
	switch v := n.(type) {
	case float64:
		if v == float64(int64(v)) {
			s = fmt.Sprintf("%d", int64(v))
		} else {
			return fmt.Sprintf("%.1f", v)
		}
	case int64:
		s = fmt.Sprintf("%d", v)
	case uint64:
		s = fmt.Sprintf("%d", v)
	case int:
		s = fmt.Sprintf("%d", v)
	default:
		return fmt.Sprintf("%v", n)
	}

	if len(s) <= 3 {
		return s
	}

	var result strings.Builder
	start := len(s) % 3
	if start > 0 {
		result.WriteString(s[:start])
	}
	for i := start; i < len(s); i += 3 {
		if result.Len() > 0 {
			result.WriteByte(',')
		}
		result.WriteString(s[i : i+3])
	}
	return result.String()
}

func kvf(key string, value any) string {
	return fmt.Sprintf("%-20s %v", key+":", value)
}

func sectionf(title string) string {
	return "## " + title
}

func joinLines(lines ...string) string {
	var result []string
	for _, l := range lines {
		if l != "" {
			result = append(result, l)
		}
	}
	return strings.Join(result, "\n")
}

func boolYesNo(b bool) string {
	if b {
		return "Yes"
	}
	return "No"
}

func cbState(isOpen bool) string {
	if isOpen {
		return "OPEN (rejecting)"
	}
	return "CLOSED"
}

func formatPct(v float64) string {
	return fmt.Sprintf("%.1f%%", v)
}

func formatMs(v float64) string {
	return fmt.Sprintf("%.1fms", v)
}

func getFloat(m map[string]any, key string) float64 {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case json.Number:
			f, _ := n.Float64()
			return f
		}
	}
	return 0
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getBool(m map[string]any, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}
