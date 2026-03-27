// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestISM.sol";

interface IMailbox {
    function setDefaultIsm(address _ism) external;
    function setDefaultHook(address _hook) external;
    function defaultIsm() external view returns (address);
    function defaultHook() external view returns (address);
    function owner() external view returns (address);
}

/**
 * @title ConfigureMailbox
 * @notice Deploys TestISM and TestHook, then configures the mailbox
 */
contract ConfigureMailbox is Script {
    // Mailbox addresses - discovered from hyperlane-init deployment
    address constant L1_MAILBOX = 0x0b48aF34f4c854F5ae1A3D587da471FeA45bAD52;
    address constant L2_MAILBOX = 0x21e128Bbc4AF60777B3FbdBC6888f5d068fcB3d4;

    function run() external {
        uint256 deployerKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        vm.startBroadcast(deployerKey);

        // Select mailbox based on chain ID
        address mailboxAddr;
        if (block.chainid == 31337) {
            mailboxAddr = L1_MAILBOX;
        } else if (block.chainid == 42069) {
            mailboxAddr = L2_MAILBOX;
        } else {
            revert("Unknown chain ID");
        }

        // Check current configuration
        IMailbox mailbox = IMailbox(mailboxAddr);
        console.log("Mailbox:", mailboxAddr);
        console.log("Current defaultIsm:", mailbox.defaultIsm());
        console.log("Current defaultHook:", mailbox.defaultHook());
        console.log("Mailbox owner:", mailbox.owner());

        // Deploy TestISM
        TestISM ism = new TestISM();
        console.log("TestISM deployed at:", address(ism));

        // Deploy TestHook
        TestHook hook = new TestHook();
        console.log("TestHook deployed at:", address(hook));

        // Configure mailbox
        console.log("Setting defaultIsm...");
        mailbox.setDefaultIsm(address(ism));

        console.log("Setting defaultHook...");
        mailbox.setDefaultHook(address(hook));

        vm.stopBroadcast();

        // Verify configuration
        console.log("");
        console.log("=== Configuration Complete ===");
        console.log("New defaultIsm:", mailbox.defaultIsm());
        console.log("New defaultHook:", mailbox.defaultHook());
    }
}
