// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {TestISM, TestHook} from "../src/TestISM.sol";
import {TestMailbox} from "../src/TestMailbox.sol";
import {HypNativeSimple} from "../src/HypNativeSimple.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {HypERC20Collateral} from "../src/HypERC20Collateral.sol";
import {HypERC20Synthetic} from "../src/HypERC20Synthetic.sol";

/**
 * @title DeployBridge
 * @notice Deploys complete bridge infrastructure: Mailbox, ISM, Hook, WarpRoute,
 *         and optionally ERC20 warp routes (collateral or synthetic).
 *
 * Deployment order (nonce-deterministic):
 *   0: TestISM
 *   1: TestHook
 *   2: TestMailbox
 *   3: HypNativeSimple
 *   4: MockUSDC (collateral mode) or HypERC20Synthetic (synthetic mode)
 *   5: HypERC20Collateral (collateral mode only)
 *
 * Environment variables:
 *   DEPLOY_ERC20  - "true" (default) or "false" to skip ERC20 warp route deployment
 *   ERC20_MODE    - "collateral" (default, L1) or "synthetic" (L2)
 *
 * Usage:
 *   # Deploy to L1 (collateral side - deploys MockUSDC + HypERC20Collateral)
 *   ERC20_MODE=collateral forge script script/DeployBridge.s.sol --rpc-url http://localhost:18545 --broadcast
 *
 *   # Deploy to L2 (synthetic side - deploys HypERC20Synthetic)
 *   ERC20_MODE=synthetic forge script script/DeployBridge.s.sol --rpc-url http://localhost:13000 --broadcast
 *
 *   # Deploy without ERC20 warp routes (original behavior)
 *   DEPLOY_ERC20=false forge script script/DeployBridge.s.sol --rpc-url http://localhost:18545 --broadcast
 */
contract DeployBridge is Script {
    function run() external {
        uint256 deployerKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        vm.startBroadcast(deployerKey);

        // Domain defaults to chain ID; override with LOCAL_DOMAIN env var
        uint32 localDomain = uint32(vm.envOr("LOCAL_DOMAIN", uint256(block.chainid)));

        console.log("Deploying bridge infrastructure on domain:", localDomain);
        console.log("Chain ID:", block.chainid);

        // 1. Deploy TestISM (nonce 0)
        TestISM ism = new TestISM();
        console.log("TestISM deployed at:", address(ism));

        // 2. Deploy TestHook (nonce 1)
        TestHook hook = new TestHook();
        console.log("TestHook deployed at:", address(hook));

        // 3. Deploy TestMailbox (nonce 2)
        TestMailbox mailbox = new TestMailbox(localDomain, address(ism), address(hook));
        console.log("TestMailbox deployed at:", address(mailbox));

        // 4. Deploy HypNativeSimple warp route (nonce 3)
        HypNativeSimple warpRoute = new HypNativeSimple(address(mailbox), localDomain);
        console.log("HypNativeSimple deployed at:", address(warpRoute));

        // 5-6. Optionally deploy ERC20 warp routes
        bool deployErc20 = vm.envOr("DEPLOY_ERC20", true);
        string memory erc20Mode = vm.envOr("ERC20_MODE", string("collateral"));
        bool isCollateral = _strEq(erc20Mode, "collateral");

        if (deployErc20) {
            console.log("");
            console.log("ERC20 warp route mode:", erc20Mode);

            if (isCollateral) {
                // Collateral mode: deploy MockUSDC (nonce 4) + HypERC20Collateral (nonce 5)
                MockUSDC mockUsdc = new MockUSDC();
                console.log("MockUSDC deployed at:", address(mockUsdc));

                HypERC20Collateral erc20Warp = new HypERC20Collateral(address(mockUsdc), address(mailbox), localDomain);
                console.log("HypERC20Collateral deployed at:", address(erc20Warp));

                // Mint 1,000,000 USDC (6 decimals) to the deployer
                address deployer = vm.addr(deployerKey);
                mockUsdc.mint(deployer, 1_000_000 * 1e6);
                console.log("Minted 1,000,000 USDC to deployer:", deployer);
            } else {
                // Synthetic mode: deploy HypERC20Synthetic (nonce 4)
                HypERC20Synthetic erc20Warp =
                    new HypERC20Synthetic("USD Coin", "USDC", 6, address(mailbox), localDomain);
                console.log("HypERC20Synthetic deployed at:", address(erc20Warp));
            }
        }

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Domain:", localDomain);
        console.log("ISM:", address(ism));
        console.log("Hook:", address(hook));
        console.log("Mailbox:", address(mailbox));
        console.log("WarpRoute (ETH):", address(warpRoute));
        if (deployErc20) {
            console.log("ERC20 Mode:", erc20Mode);
        }
        console.log("");
        console.log("Next steps:");
        console.log("1. Deploy to the other chain");
        console.log("2. Run EnrollRouters script to connect them");
        console.log("3. Fund warp routes with ETH for bridging");
        if (deployErc20 && isCollateral) {
            console.log("4. Approve HypERC20Collateral to spend USDC before bridging");
        }
    }

    /// @dev Compare two strings for equality
    function _strEq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }
}
