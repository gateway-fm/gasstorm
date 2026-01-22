// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IHypNativeSimple {
    function enrollRemoteRouter(uint32 domain, bytes32 router) external;
    function routers(uint32 domain) external view returns (bytes32);
    function owner() external view returns (address);
}

/**
 * @title EnrollRouters
 * @notice Enrolls remote routers on warp routes to enable cross-chain transfers
 *
 * Usage:
 *   # Set environment variables with the deployed addresses first!
 *   export L1_WARP=0x...
 *   export L2_WARP=0x...
 *
 *   # Enroll L2 router on L1 warp route
 *   forge script script/EnrollRouters.s.sol --rpc-url http://localhost:18545 --broadcast
 *
 *   # Enroll L1 router on L2 warp route
 *   forge script script/EnrollRouters.s.sol --rpc-url http://localhost:13000 --broadcast
 */
contract EnrollRouters is Script {
    // Domain IDs
    uint32 constant L1_DOMAIN = 31337;
    uint32 constant L2_DOMAIN = 42069;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        // Get warp route addresses from environment
        address l1Warp = vm.envAddress("L1_WARP");
        address l2Warp = vm.envAddress("L2_WARP");

        require(l1Warp != address(0), "L1_WARP not set");
        require(l2Warp != address(0), "L2_WARP not set");

        console.log("L1 Warp Route:", l1Warp);
        console.log("L2 Warp Route:", l2Warp);

        vm.startBroadcast(deployerKey);

        // Determine which chain we're on and enroll the remote router
        if (block.chainid == 31337) {
            // We're on L1, enroll L2 router
            console.log("On L1, enrolling L2 router...");
            IHypNativeSimple(l1Warp).enrollRemoteRouter(L2_DOMAIN, bytes32(uint256(uint160(l2Warp))));
            console.log("Enrolled L2 router on L1 warp route");

            // Verify
            bytes32 enrolled = IHypNativeSimple(l1Warp).routers(L2_DOMAIN);
            console.log("L1 routers[L2_DOMAIN] =", vm.toString(enrolled));
        } else if (block.chainid == 42069) {
            // We're on L2, enroll L1 router
            console.log("On L2, enrolling L1 router...");
            IHypNativeSimple(l2Warp).enrollRemoteRouter(L1_DOMAIN, bytes32(uint256(uint160(l1Warp))));
            console.log("Enrolled L1 router on L2 warp route");

            // Verify
            bytes32 enrolled = IHypNativeSimple(l2Warp).routers(L1_DOMAIN);
            console.log("L2 routers[L1_DOMAIN] =", vm.toString(enrolled));
        } else {
            revert("Unknown chain ID");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Enrollment Complete ===");
    }
}
