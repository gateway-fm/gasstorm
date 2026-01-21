// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TestMailbox
 * @notice A minimal Hyperlane Mailbox for POC testing
 * @dev Simplified version - no proxy, no complex ISM/hook verification
 */
interface IMailboxISM {
    function verify(bytes calldata metadata, bytes calldata message) external returns (bool);
}

interface IMailboxHook {
    function postDispatch(bytes calldata metadata, bytes calldata message) external payable;
    function quoteDispatch(bytes calldata metadata, bytes calldata message) external view returns (uint256);
}

interface IMailboxRecipient {
    function handle(uint32 origin, bytes32 sender, bytes calldata message) external;
}

contract TestMailbox {
    // Events (matching Hyperlane's Mailbox events)
    event Dispatch(
        address indexed sender,
        uint32 indexed destination,
        bytes32 indexed recipient,
        bytes message
    );
    event DispatchId(bytes32 indexed messageId);
    event Process(
        uint32 indexed origin,
        bytes32 indexed sender,
        address indexed recipient
    );
    event ProcessId(bytes32 indexed messageId);

    // Domain ID for this mailbox
    uint32 public immutable localDomain;

    // Nonce for message IDs
    uint32 public nonce;

    // Default ISM and Hook
    address public defaultIsm;
    address public defaultHook;
    address public requiredHook;

    // Owner
    address public owner;

    // Message version
    uint8 public constant VERSION = 3;

    // Delivered messages (messageId => delivered)
    mapping(bytes32 => bool) public delivered;

    modifier onlyOwner() {
        require(msg.sender == owner, "Mailbox: not owner");
        _;
    }

    constructor(uint32 _localDomain, address _defaultIsm, address _defaultHook) {
        localDomain = _localDomain;
        defaultIsm = _defaultIsm;
        defaultHook = _defaultHook;
        requiredHook = _defaultHook;
        owner = msg.sender;
    }

    /**
     * @notice Set the default ISM
     */
    function setDefaultIsm(address _ism) external onlyOwner {
        defaultIsm = _ism;
    }

    /**
     * @notice Set the default hook
     */
    function setDefaultHook(address _hook) external onlyOwner {
        defaultHook = _hook;
        requiredHook = _hook;
    }

    /**
     * @notice Dispatch a message to a remote domain
     */
    function dispatch(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes calldata _messageBody
    ) external payable returns (bytes32) {
        return _dispatchInternal(_destinationDomain, _recipientAddress, _messageBody, new bytes(0));
    }

    /**
     * @notice Internal dispatch function
     */
    function _dispatchInternal(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes calldata _messageBody,
        bytes memory _metadata
    ) internal returns (bytes32) {
        // Build the message
        bytes memory message = _buildMessage(
            _destinationDomain,
            _recipientAddress,
            _messageBody
        );

        // Compute message ID
        bytes32 messageId = keccak256(message);

        // Increment nonce
        nonce++;

        // Call post-dispatch hook if configured
        if (defaultHook != address(0)) {
            uint256 quote = IMailboxHook(defaultHook).quoteDispatch(_metadata, message);
            IMailboxHook(defaultHook).postDispatch{value: quote}(_metadata, message);
        }

        emit Dispatch(msg.sender, _destinationDomain, _recipientAddress, message);
        emit DispatchId(messageId);

        return messageId;
    }

    /**
     * @notice Process an inbound message
     */
    function process(bytes calldata _metadata, bytes calldata _message) external {
        // Parse message
        (
            uint8 version,
            uint32 nonce_,
            uint32 origin,
            bytes32 sender,
            uint32 destination,
            bytes32 recipient,
            bytes memory body
        ) = _parseMessage(_message);

        require(version == VERSION, "Mailbox: bad version");
        require(destination == localDomain, "Mailbox: wrong destination");

        bytes32 messageId = keccak256(_message);
        require(!delivered[messageId], "Mailbox: already delivered");

        // Verify with ISM if configured
        if (defaultIsm != address(0)) {
            require(
                IMailboxISM(defaultIsm).verify(_metadata, _message),
                "Mailbox: ISM verification failed"
            );
        }

        // Mark as delivered
        delivered[messageId] = true;

        // Deliver to recipient
        address recipientAddr = address(uint160(uint256(recipient)));
        IMailboxRecipient(recipientAddr).handle(origin, sender, body);

        emit Process(origin, sender, recipientAddr);
        emit ProcessId(messageId);
    }

    /**
     * @notice Build a Hyperlane message
     */
    function _buildMessage(
        uint32 _destinationDomain,
        bytes32 _recipientAddress,
        bytes calldata _messageBody
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            VERSION,
            nonce,
            localDomain,
            bytes32(uint256(uint160(msg.sender))), // sender as bytes32
            _destinationDomain,
            _recipientAddress,
            _messageBody
        );
    }

    /**
     * @notice Parse a Hyperlane message
     */
    function _parseMessage(bytes calldata _message)
        internal
        pure
        returns (
            uint8 version,
            uint32 nonce_,
            uint32 origin,
            bytes32 sender,
            uint32 destination,
            bytes32 recipient,
            bytes memory body
        )
    {
        require(_message.length >= 77, "Mailbox: message too short");

        version = uint8(_message[0]);
        nonce_ = uint32(bytes4(_message[1:5]));
        origin = uint32(bytes4(_message[5:9]));
        sender = bytes32(_message[9:41]);
        destination = uint32(bytes4(_message[41:45]));
        recipient = bytes32(_message[45:77]);
        body = _message[77:];
    }

    /**
     * @notice Get the count of dispatched messages
     */
    function count() external view returns (uint32) {
        return nonce;
    }

    /**
     * @notice Quote dispatch fee
     */
    function quoteDispatch(
        uint32, /* _destinationDomain */
        bytes32, /* _recipientAddress */
        bytes calldata /* _messageBody */
    ) external pure returns (uint256) {
        return 0; // No fee for POC
    }

    /**
     * @notice Get the ISM for a recipient
     * @dev Required by Hyperlane relayer to determine which ISM to use for verification
     */
    function recipientIsm(address /* _recipient */) external view returns (address) {
        // Always return the default ISM for simplicity
        return defaultIsm;
    }

    /**
     * @notice Receive ETH
     */
    receive() external payable {}
}
