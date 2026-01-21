// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/HypNativeSimple.sol";

/**
 * @title DeployWarpRoutes
 * @notice Deploys HypNativeSimple warp routes on both L1 and L2
 *
 * Usage:
 *   # Deploy to L1
 *   forge script script/DeployWarpRoutes.s.sol --rpc-url http://localhost:18545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 *   # Deploy to L2
 *   forge script script/DeployWarpRoutes.s.sol --rpc-url http://localhost:13000 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 */
contract DeployWarpRoutes is Script {
    // Mailbox addresses - discovered from hyperlane-init deployment
    // Note: These can change when the chain is reset, check hyperlane-init logs for current addresses
    address constant L1_MAILBOX = 0x0b48aF34f4c854F5ae1A3D587da471FeA45bAD52;
    address constant L2_MAILBOX = 0x21e128Bbc4AF60777B3FbdBC6888f5d068fcB3d4;

    // Domain IDs
    uint32 constant L1_DOMAIN = 31337;
    uint32 constant L2_DOMAIN = 42069;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        // Detect which chain we're on by checking chain ID
        vm.startBroadcast(deployerKey);

        // Select mailbox based on chain ID
        address mailbox;
        uint32 localDomain;
        if (block.chainid == 1) {
            // L1 (Anvil)
            mailbox = L1_MAILBOX;
            localDomain = L1_DOMAIN;
        } else if (block.chainid == 42069) {
            // L2
            mailbox = L2_MAILBOX;
            localDomain = L2_DOMAIN;
        } else {
            revert("Unknown chain ID");
        }

        console.log("Deploying HypNativeSimple on domain:", localDomain);
        console.log("Mailbox:", mailbox);

        // Deploy the warp route
        HypNativeSimple warpRoute = new HypNativeSimple(mailbox, localDomain);
        console.log("HypNativeSimple deployed at:", address(warpRoute));

        vm.stopBroadcast();

        // Output for use in configuration
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Chain Domain:", localDomain);
        console.log("WarpRoute Address:", address(warpRoute));
        console.log("");
        console.log("Next: Run enrollment script to configure remote routers");
    }
}
