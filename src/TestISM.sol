// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TestISM
 * @notice A test ISM that always accepts messages (for POC only!)
 * @dev DO NOT USE IN PRODUCTION - accepts all messages without verification
 */
contract TestISM {
    uint8 public constant moduleType = 6; // NULL type - always accepts messages

    function verify(
        bytes calldata, /* _metadata */
        bytes calldata  /* _message */
    ) external pure returns (bool) {
        return true; // Always accept
    }
}

interface ITestMailbox {
    function nonce() external view returns (uint32);
}

/**
 * @title TestHook
 * @notice A test post-dispatch hook that mimics MerkleTreeHook for POC
 * @dev Implements count() and latestCheckpoint() required by the Hyperlane relayer
 */
contract TestHook {
    uint8 public constant hookType = 1; // NOOP type

    // Reference to the mailbox to get nonce
    address public mailbox;

    // Track inserted messages for merkle tree hook interface
    uint32 internal _count;

    // Events matching MerkleLib - NEITHER param is indexed in the original
    // topics=[sig], data=[messageId, index]
    event InsertedIntoTree(bytes32 messageId, uint32 index);

    constructor() {
        // Mailbox will be set later or discovered
    }

    function setMailbox(address _mailbox) external {
        require(mailbox == address(0), "Already set");
        mailbox = _mailbox;
    }

    function supportsMetadata(bytes calldata) external pure returns (bool) {
        return true;
    }

    function postDispatch(
        bytes calldata, /* metadata */
        bytes calldata message
    ) external payable {
        // Track the message for merkle tree hook compatibility
        bytes32 messageId = keccak256(message);
        emit InsertedIntoTree(messageId, _count);
        _count++;
    }

    function quoteDispatch(
        bytes calldata, /* metadata */
        bytes calldata  /* message */
    ) external pure returns (uint256) {
        return 0; // No payment required
    }

    /**
     * @notice Returns the number of messages inserted (required by relayer)
     */
    function count() external view returns (uint32) {
        return _count;
    }

    /**
     * @notice Returns a dummy merkle root (required by relayer for checkpoint)
     */
    function root() external pure returns (bytes32) {
        return bytes32(0);
    }

    /**
     * @notice Returns the latest checkpoint (root, count)
     */
    function latestCheckpoint() external view returns (bytes32, uint32) {
        return (bytes32(0), _count);
    }
}
