// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestISM.sol";
import "../src/TestMailbox.sol";
import "../src/HypNativeSimple.sol";

/**
 * @title DeployBridge
 * @notice Deploys complete bridge infrastructure: Mailbox, ISM, Hook, and WarpRoute
 *
 * Usage:
 *   # Deploy to L1
 *   forge script script/DeployBridge.s.sol --rpc-url http://localhost:18545 --broadcast
 *
 *   # Deploy to L2
 *   forge script script/DeployBridge.s.sol --rpc-url http://localhost:13000 --broadcast
 */
contract DeployBridge is Script {
    // Domain IDs
    uint32 constant L1_DOMAIN = 31337;
    uint32 constant L2_DOMAIN = 42069;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(deployerKey);

        // Determine which chain we're on
        uint32 localDomain;
        if (block.chainid == 1) {
            localDomain = L1_DOMAIN;
        } else if (block.chainid == 42069) {
            localDomain = L2_DOMAIN;
        } else {
            revert("Unknown chain ID");
        }

        console.log("Deploying bridge infrastructure on domain:", localDomain);
        console.log("Chain ID:", block.chainid);

        // 1. Deploy TestISM
        TestISM ism = new TestISM();
        console.log("TestISM deployed at:", address(ism));

        // 2. Deploy TestHook
        TestHook hook = new TestHook();
        console.log("TestHook deployed at:", address(hook));

        // 3. Deploy TestMailbox
        TestMailbox mailbox = new TestMailbox(localDomain, address(ism), address(hook));
        console.log("TestMailbox deployed at:", address(mailbox));

        // 4. Deploy HypNativeSimple warp route
        HypNativeSimple warpRoute = new HypNativeSimple(address(mailbox), localDomain);
        console.log("HypNativeSimple deployed at:", address(warpRoute));

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Domain:", localDomain);
        console.log("ISM:", address(ism));
        console.log("Hook:", address(hook));
        console.log("Mailbox:", address(mailbox));
        console.log("WarpRoute:", address(warpRoute));
        console.log("");
        console.log("Next steps:");
        console.log("1. Deploy to the other chain");
        console.log("2. Run EnrollRouters script to connect them");
        if (localDomain == L2_DOMAIN) {
            console.log("3. Fund the L2 warp route with ETH");
        }
    }
}
