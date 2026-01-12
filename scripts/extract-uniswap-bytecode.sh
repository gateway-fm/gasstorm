#!/bin/bash
# Extract Uniswap V3 bytecode from npm packages

set -e

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "Installing Uniswap V3 packages..."
npm init -y >/dev/null 2>&1
npm install @uniswap/v3-core @uniswap/v3-periphery >/dev/null 2>&1

echo ""
echo "=== UniswapV3Factory bytecode ==="
node -e "const f = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'); console.log(f.bytecode)"

echo ""
echo "=== UniswapV3Pool bytecode ==="
node -e "const f = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'); console.log(f.bytecode)"

echo ""
echo "=== SwapRouter bytecode ==="
node -e "const f = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json'); console.log(f.bytecode)"

echo ""
echo "=== NonfungiblePositionManager bytecode ==="
node -e "const f = require('@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'); console.log(f.bytecode)"

# Cleanup
rm -rf "$TEMP_DIR"
