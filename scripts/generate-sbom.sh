#!/bin/bash
# Generate Software Bill of Materials (SBOM) for all components
# Outputs CycloneDX JSON format for compliance documentation

set -e

OUTPUT_DIR="${1:-./sbom}"
mkdir -p "$OUTPUT_DIR"

echo "Generating SBOM for sequencer-poc components..."
echo "Output directory: $OUTPUT_DIR"
echo ""

# Check if syft is available for comprehensive SBOM
if command -v syft &> /dev/null; then
    echo "Using syft for comprehensive SBOM generation..."

    # Generate SBOM for block-builder
    echo "  - block-builder..."
    syft dir:./block-builder -o cyclonedx-json > "$OUTPUT_DIR/block-builder.sbom.json"

    # Generate SBOM for load-generator
    echo "  - load-generator..."
    syft dir:../loadgenerator -o cyclonedx-json > "$OUTPUT_DIR/load-generator.sbom.json"

    # Generate SBOM for zisk-prover
    echo "  - zisk-prover..."
    syft dir:./zisk-prover -o cyclonedx-json > "$OUTPUT_DIR/zisk-prover.sbom.json"

    # Generate SBOM for dashboard
    echo "  - dashboard..."
    syft dir:./dashboard -o cyclonedx-json > "$OUTPUT_DIR/dashboard.sbom.json"

    # Generate SBOM for bridge-ui
    echo "  - bridge-ui..."
    syft dir:./bridge-ui -o cyclonedx-json > "$OUTPUT_DIR/bridge-ui.sbom.json"

    echo ""
    echo "SBOM generation complete (syft)."
else
    echo "syft not found. Generating basic SBOM from go.mod files..."
    echo "(Install syft for comprehensive SBOM: https://github.com/anchore/syft)"
    echo ""

    # Generate basic SBOM from Go modules
    generate_go_sbom() {
        local name="$1"
        local dir="$2"
        local output
        output="$(cd "$(dirname "$OUTPUT_DIR")" && pwd)/$(basename "$OUTPUT_DIR")/${name}.sbom.json"

        if [ -f "$dir/go.mod" ]; then
            echo "  - $name (Go module)..."
            (
                cd "$dir"
                go list -m -json all 2>/dev/null | jq -s '{
                    "bomFormat": "CycloneDX",
                    "specVersion": "1.4",
                    "version": 1,
                    "metadata": {
                        "timestamp": (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                        "component": {
                            "type": "application",
                            "name": "'"$name"'",
                            "version": "0.0.1"
                        }
                    },
                    "components": [.[] | select(.Path != null and .Main != true) | {
                        "type": "library",
                        "name": .Path,
                        "version": (.Version // "unknown"),
                        "purl": ("pkg:golang/" + .Path + "@" + (.Version // "unknown"))
                    }]
                }' > "$output"
            )
        fi
    }

    # Generate basic SBOM from package.json
    generate_npm_sbom() {
        local name="$1"
        local dir="$2"
        local output
        output="$(cd "$(dirname "$OUTPUT_DIR")" && pwd)/$(basename "$OUTPUT_DIR")/${name}.sbom.json"

        if [ -f "$dir/package.json" ]; then
            echo "  - $name (npm)..."
            (
                cd "$dir"
                # Check if node_modules exists
                if [ -d "node_modules" ]; then
                    npm ls --json 2>/dev/null | jq '{
                        "bomFormat": "CycloneDX",
                        "specVersion": "1.4",
                        "version": 1,
                        "metadata": {
                            "timestamp": (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
                            "component": {
                                "type": "application",
                                "name": .name,
                                "version": .version
                            }
                        },
                        "components": [(.dependencies // {}) | to_entries[] | {
                            "type": "library",
                            "name": .key,
                            "version": .value.version,
                            "purl": ("pkg:npm/" + .key + "@" + .value.version)
                        }]
                    }' > "$output" 2>/dev/null || echo "    (skipped - npm ls failed)"
                else
                    echo "    (skipped - node_modules not found, run npm install first)"
                fi
            )
        fi
    }

    generate_go_sbom "block-builder" "./block-builder"
    generate_go_sbom "load-generator" "../loadgenerator"
    generate_go_sbom "zisk-prover" "./zisk-prover"
    generate_npm_sbom "dashboard" "./dashboard"
    generate_npm_sbom "bridge-ui" "./bridge-ui"

    echo ""
    echo "Basic SBOM generation complete."
    echo "For comprehensive SBOM including transitive dependencies and vulnerability data,"
    echo "install syft: brew install syft (macOS) or see https://github.com/anchore/syft"
fi

echo ""
echo "Generated SBOMs:"
ls -la "$OUTPUT_DIR"/*.sbom.json 2>/dev/null || echo "No SBOM files generated"
