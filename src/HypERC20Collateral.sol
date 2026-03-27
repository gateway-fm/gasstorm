// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HypERC20Collateral
 * @notice Minimal warp route for ERC20 bridging via Hyperlane (collateral side)
 * @dev Locks/unlocks an existing ERC20 token on the canonical chain.
 *      Simplified version for POC - same pattern as HypNativeSimple.
 */
interface IMailbox {
    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        payable
        returns (bytes32);

    function process(bytes calldata metadata, bytes calldata message) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IInterchainSecurityModule {
    function verify(bytes calldata metadata, bytes calldata message) external returns (bool);
}

contract HypERC20Collateral {
    // Events
    event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount);
    event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount);

    // ERC20 token being bridged
    address public immutable token;

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

    constructor(address _token, address _mailbox, uint32 _localDomain) {
        token = _token;
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
     * @notice Transfer ERC20 tokens to a remote chain
     * @param _destination The destination domain ID
     * @param _recipient The recipient address (as bytes32)
     * @param _amount The amount of tokens to transfer
     * @return messageId The Hyperlane message ID
     */
    function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount)
        external
        payable
        returns (bytes32)
    {
        require(routers[_destination] != bytes32(0), "No router for domain");
        require(_amount > 0, "Amount must be > 0");

        // Lock tokens in this contract
        require(IERC20(token).transferFrom(msg.sender, address(this), _amount), "TransferFrom failed");

        // Encode the transfer message
        bytes memory messageBody = abi.encode(_recipient, _amount);

        // Dispatch message via mailbox (msg.value goes to gas payment)
        bytes32 messageId =
            IMailbox(mailbox).dispatch{value: msg.value}(_destination, routers[_destination], messageBody);

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

        // Unlock tokens and transfer to recipient
        require(IERC20(token).transfer(recipientAddr, amount), "Token transfer failed");

        emit ReceivedTransferRemote(_origin, recipient, amount);
    }

    /**
     * @notice Get the locked token balance held by this contract
     */
    function balanceOf(address) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Withdraw stuck tokens (emergency only)
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner, amount), "Withdraw failed");
    }
}
