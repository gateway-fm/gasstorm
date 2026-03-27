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
 *   export LOCAL_WARP=0x...   # Warp route on the chain you're deploying to
 *   export REMOTE_WARP=0x...  # Warp route on the other chain
 *   export REMOTE_DOMAIN=42069  # Hyperlane domain ID of the other chain
 *
 *   # Enroll remote router on local warp route
 *   forge script script/EnrollRouters.s.sol --rpc-url http://localhost:18545 --broadcast
 */
contract EnrollRouters is Script {
    function run() external {
        uint256 deployerKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        // Get warp route addresses and remote domain from environment
        // LOCAL_WARP: the warp route on the current chain
        // REMOTE_WARP: the warp route on the remote chain
        // REMOTE_DOMAIN: the Hyperlane domain ID of the remote chain
        address localWarp = vm.envAddress("LOCAL_WARP");
        address remoteWarp = vm.envAddress("REMOTE_WARP");
        uint32 remoteDomain = uint32(vm.envUint("REMOTE_DOMAIN"));

        require(localWarp != address(0), "LOCAL_WARP not set");
        require(remoteWarp != address(0), "REMOTE_WARP not set");
        require(remoteDomain != 0, "REMOTE_DOMAIN not set");

        console.log("Local Warp Route:", localWarp);
        console.log("Remote Warp Route:", remoteWarp);
        console.log("Remote Domain:", remoteDomain);

        vm.startBroadcast(deployerKey);

        // Enroll the remote router on the local warp route
        console.log("Enrolling remote router...");
        IHypNativeSimple(localWarp).enrollRemoteRouter(remoteDomain, bytes32(uint256(uint160(remoteWarp))));
        console.log("Enrolled remote router on local warp route");

        // Verify
        bytes32 enrolled = IHypNativeSimple(localWarp).routers(remoteDomain);
        console.log("routers[remoteDomain] =", vm.toString(enrolled));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Enrollment Complete ===");
    }
}
