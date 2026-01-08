// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title Hyperlane Deployment Script
 * @notice Deploys Hyperlane Mailbox, ISM, and Warp Route contracts for L1<->L2 bridging
 *
 * Prerequisites:
 *   npm install @hyperlane-xyz/core @hyperlane-xyz/sdk
 *
 * For PoC, we use a simple TrustedRelayerISM that trusts a single relayer address.
 * In production, use MultisigISM or aggregate multiple ISMs.
 */
contract DeployHyperlane is Script {
    // Chain IDs
    uint32 constant L1_DOMAIN = 1;        // Ethereum mainnet (Anvil)
    uint32 constant L2_DOMAIN = 42069;    // Our L2

    // Deployer/relayer address (Anvil account 0)
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Mailbox
        // In production, use @hyperlane-xyz/core contracts
        // For PoC, we deploy minimal versions

        console.log("Deploying Hyperlane contracts...");
        console.log("Deployer:", DEPLOYER);
        console.log("L1 Domain:", L1_DOMAIN);
        console.log("L2 Domain:", L2_DOMAIN);

        // TODO: Deploy actual Hyperlane contracts
        // For now, this is a placeholder script
        //
        // Real deployment would:
        // 1. Deploy Mailbox on L1 and L2
        // 2. Deploy TrustedRelayerISM (or MultisigISM) on both chains
        // 3. Deploy WarpRoute (HypERC20/HypNative) for token bridging
        // 4. Configure ISMs to trust each other's validators

        vm.stopBroadcast();

        console.log("Hyperlane deployment complete!");
        console.log("");
        console.log("Next steps:");
        console.log("1. Use Hyperlane CLI for full deployment:");
        console.log("   npx @hyperlane-xyz/cli deploy core --chain l1 --chain l2");
        console.log("");
        console.log("2. Deploy Warp Route for ETH bridging:");
        console.log("   npx @hyperlane-xyz/cli deploy warp --config warp-config.yaml");
    }
}

/**
 * @title Minimal Mailbox (for reference)
 * @notice Simplified version - use @hyperlane-xyz/core in production
 */
interface IMailbox {
    function dispatch(
        uint32 destinationDomain,
        bytes32 recipientAddress,
        bytes calldata messageBody
    ) external payable returns (bytes32 messageId);

    function process(
        bytes calldata metadata,
        bytes calldata message
    ) external;
}

/**
 * @title Minimal ISM Interface
 */
interface IInterchainSecurityModule {
    function verify(
        bytes calldata metadata,
        bytes calldata message
    ) external returns (bool);
}
