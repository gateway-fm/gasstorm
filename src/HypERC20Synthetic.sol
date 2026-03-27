// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HypERC20Synthetic
 * @notice Minimal warp route for ERC20 bridging via Hyperlane (synthetic side)
 * @dev IS the ERC20 token - mints on receive, burns on send.
 *      Simplified version for POC - same pattern as HypNativeSimple.
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

contract HypERC20Synthetic {
    // ─── ERC20 Storage ────────────────────────────────────────────────
    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ERC20 Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ─── Warp Route Events ────────────────────────────────────────────
    event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amount);
    event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amount);

    // ─── Hyperlane State ──────────────────────────────────────────────
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

    constructor(string memory _name, string memory _symbol, uint8 _decimals, address _mailbox, uint32 _localDomain) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        mailbox = _mailbox;
        localDomain = _localDomain;
        owner = msg.sender;
    }

    // ─── ERC20 Functions ──────────────────────────────────────────────

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (from != msg.sender && allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ─── Warp Route Functions ─────────────────────────────────────────

    /**
     * @notice This contract IS the token
     */
    function token() external view returns (address) {
        return address(this);
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
     * @notice Transfer synthetic tokens to a remote chain (burns locally)
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

        // Burn tokens from sender
        _burn(msg.sender, _amount);

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

        // Mint tokens to recipient
        _mint(recipientAddr, amount);

        emit ReceivedTransferRemote(_origin, recipient, amount);
    }
}
