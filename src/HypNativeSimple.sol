// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HypNativeSimple
 * @notice Minimal warp route for native ETH bridging via Hyperlane
 * @dev Simplified version for POC - handles ETH lock/unlock between chains
 */
interface IMailbox {
    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        payable
        returns (bytes32);

    function process(bytes calldata metadata, bytes calldata message) external;
}

interface IInterchainSecurityModule {
    function verify(bytes calldata metadata, bytes calldata message) external returns (bool);
}

contract HypNativeSimple {
    // Events
    event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount);
    event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount);

    // Hyperlane mailbox
    address public immutable mailbox;
    uint32 public immutable localDomain;

    // Remote router addresses (domain => router address as bytes32)
    mapping(uint32 => bytes32) public routers;

    // ISM for verification (optional, defaults to mailbox's default)
    address public interchainSecurityModule;

    // Owner for configuration
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMailbox() {
        require(msg.sender == mailbox, "Not mailbox");
        _;
    }

    constructor(address _mailbox, uint32 _localDomain) {
        mailbox = _mailbox;
        localDomain = _localDomain;
        owner = msg.sender;
    }

    /**
     * @notice Enroll a remote router for a domain
     * @param domain The remote domain ID
     * @param router The router address on that domain (as bytes32)
     */
    function enrollRemoteRouter(uint32 domain, bytes32 router) external onlyOwner {
        routers[domain] = router;
    }

    /**
     * @notice Set the ISM (optional)
     */
    function setInterchainSecurityModule(address _ism) external onlyOwner {
        interchainSecurityModule = _ism;
    }

    /**
     * @notice Transfer native ETH to a remote chain
     * @param _destination The destination domain ID
     * @param _recipient The recipient address (as bytes32)
     * @param _amount The amount to transfer (must match msg.value minus gas payment)
     * @return messageId The Hyperlane message ID
     */
    function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount)
        external
        payable
        returns (bytes32)
    {
        require(routers[_destination] != bytes32(0), "No router for domain");
        require(msg.value >= _amount, "Insufficient value");

        // Encode the transfer message
        bytes memory messageBody = abi.encode(_recipient, _amount);

        // Get gas payment (msg.value - amount goes to gas payment)
        uint256 gasPayment = msg.value - _amount;

        // Dispatch message via mailbox
        bytes32 messageId =
            IMailbox(mailbox).dispatch{value: gasPayment}(_destination, routers[_destination], messageBody);

        emit SentTransferRemote(_destination, _recipient, _amount);
        return messageId;
    }

    /**
     * @notice Quote gas payment for a transfer
     * @dev Returns 0 for simplicity in POC (no interchain gas paymaster)
     */
    function quoteGasPayment(
        uint32 /* _destination */
    )
        external
        pure
        returns (uint256)
    {
        return 0;
    }

    /**
     * @notice Handle incoming message from mailbox
     * @param _origin The origin domain ID
     * @param _sender The sender address on origin chain
     * @param _message The message body
     */
    function handle(uint32 _origin, bytes32 _sender, bytes calldata _message) external onlyMailbox {
        require(_sender == routers[_origin], "Invalid router");

        // Decode the transfer
        (bytes32 recipient, uint256 amount) = abi.decode(_message, (bytes32, uint256));

        // Convert bytes32 to address
        address recipientAddr = address(uint160(uint256(recipient)));

        // Transfer ETH to recipient
        (bool success,) = recipientAddr.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit ReceivedTransferRemote(_origin, recipient, amount);
    }

    /**
     * @notice Receive ETH (for funding the contract to pay out on L2)
     */
    receive() external payable {}

    /**
     * @notice Get balance of this contract (warp collateral)
     */
    function balanceOf(address) external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Withdraw stuck funds (emergency only)
     */
    function withdraw(uint256 amount) external onlyOwner {
        (bool success,) = owner.call{value: amount}("");
        require(success, "Withdraw failed");
    }
}
