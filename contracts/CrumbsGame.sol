// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface INativeVRFWrapper {
    function calculateRequestPriceNative(uint32 callbackGasLimit, uint32 numWords) external view returns (uint256);
    function requestRandomWordsInNative(uint32 callbackGasLimit, uint16 confirmations, uint32 numWords, bytes calldata extraArgs) external payable returns (uint256 requestId);
}

contract CrumbsGame {
    struct Play {
        address player;
        uint64 enteredAt;
        uint32 seed;
        uint8 state;
        uint256 requestId;
        uint256 randomWord;
        uint256 oracleFee;
        uint256 payout;
    }

    address public immutable owner;
    INativeVRFWrapper public immutable wrapper;
    uint256 public immutable entryPrice;
    uint32 public constant CALLBACK_GAS = 100000;
    uint16 public constant CONFIRMATIONS = 10;
    uint256 public locked;
    bool public paused;
    bool private entered;
    mapping(bytes32 => Play) public plays;
    mapping(uint256 => bytes32) public requestToPlay;
    mapping(address => uint256) public credit;

    error Invalid();
    error Unauthorized();
    error WrongState();
    error InsufficientReserve();
    error OracleTooExpensive();
    error TransferFailed();
    event Entered(bytes32 indexed playId, address indexed player, uint32 seed);
    event DrawRequested(bytes32 indexed playId, uint256 indexed requestId, uint256 oracleFee);
    event RandomnessReceived(bytes32 indexed playId, uint256 indexed requestId);
    event Settled(bytes32 indexed playId, address indexed player, uint256 payout, bool higherReturn);
    event Refunded(bytes32 indexed playId, address indexed player);
    event Claimed(address indexed player, address indexed recipient, uint256 amount);
    event BankFunded(address indexed sender, uint256 amount);
    event BankWithdrawn(uint256 amount);

    constructor(address wrapperAddress, uint256 price) {
        if (wrapperAddress.code.length == 0 || price == 0 || price % 100000 != 0) revert Invalid();
        owner = msg.sender;
        wrapper = INativeVRFWrapper(wrapperAddress);
        entryPrice = price;
    }

    modifier nonReentrant() {
        if (entered) revert WrongState();
        entered = true;
        _;
        entered = false;
    }

    function maximumPayout() public view returns (uint256) { return entryPrice * 224877 / 100000; }
    function oracleBudget() public view returns (uint256) { return entryPrice * 2 / 100; }
    function freeReserve() public view returns (uint256) { return address(this).balance - locked; }

    function enter(bytes32 playId) external payable nonReentrant {
        if (paused || msg.value != entryPrice || playId == bytes32(0) || plays[playId].player != address(0)) revert Invalid();
        if (wrapper.calculateRequestPriceNative(CALLBACK_GAS, 1) > oracleBudget()) revert OracleTooExpensive();
        uint256 liability = maximumPayout() + oracleBudget();
        if (address(this).balance < locked + liability) revert InsufficientReserve();
        uint32 seed = uint32(uint256(keccak256(abi.encode(playId, msg.sender, blockhash(block.number - 1)))));
        plays[playId] = Play(msg.sender, uint64(block.timestamp), seed, 1, 0, 0, 0, 0);
        locked += liability;
        emit Entered(playId, msg.sender, seed);
    }

    function draw(bytes32 playId) external nonReentrant {
        Play storage play = plays[playId];
        if (play.state != 1 || block.timestamp >= uint256(play.enteredAt) + 1 days) revert WrongState();
        uint256 fee = wrapper.calculateRequestPriceNative(CALLBACK_GAS, 1);
        if (fee > oracleBudget()) revert OracleTooExpensive();
        play.state = 2;
        play.oracleFee = fee;
        locked -= oracleBudget();
        bytes memory extraArgs = abi.encodeWithSelector(bytes4(keccak256("VRF ExtraArgsV1")), true);
        uint256 requestId = wrapper.requestRandomWordsInNative{value: fee}(CALLBACK_GAS, CONFIRMATIONS, 1, extraArgs);
        play.requestId = requestId;
        requestToPlay[requestId] = playId;
        emit DrawRequested(playId, requestId, fee);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata words) external {
        if (msg.sender != address(wrapper)) revert Unauthorized();
        bytes32 id = requestToPlay[requestId];
        Play storage play = plays[id];
        if (id == bytes32(0) || play.state != 2 || words.length == 0) return;
        play.randomWord = words[0];
        play.state = 3;
        emit RandomnessReceived(id, requestId);
    }

    function multiplierFor(uint256 word) public pure returns (uint256) {
        uint256 tier = uint256(keccak256(abi.encode(word, uint256(0)))) % 10000;
        uint256 value = uint256(keccak256(abi.encode(word, uint256(1))));
        if (tier < 6000) return 80123 + value % 15755;
        if (tier < 9500) return 103123 + value % 4755;
        if (tier < 9950) return 110123 + value % 9755;
        return 175123 + value % 49755;
    }

    function settle(bytes32 playId) external {
        Play storage play = plays[playId];
        if (play.state != 3) revert WrongState();
        uint256 multiplier = multiplierFor(play.randomWord);
        bool higherReturn = multiplier > 100000;
        uint256 payout = entryPrice * multiplier / 100000;
        play.payout = payout;
        play.state = 4;
        locked = locked - maximumPayout() + payout;
        credit[play.player] += payout;
        emit Settled(playId, play.player, payout, higherReturn);
    }

    function refundUnrequested(bytes32 playId) external {
        Play storage play = plays[playId];
        if (play.state != 1 || msg.sender != play.player || block.timestamp < uint256(play.enteredAt) + 1 days) revert WrongState();
        play.state = 5;
        play.payout = entryPrice;
        locked = locked - maximumPayout() - oracleBudget() + entryPrice;
        credit[play.player] += entryPrice;
        emit Refunded(playId, play.player);
    }

    function claim(address payable recipient) external nonReentrant {
        uint256 amount = credit[msg.sender];
        if (amount == 0 || recipient == address(0)) revert Invalid();
        credit[msg.sender] = 0;
        locked -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(msg.sender, recipient, amount);
    }

    function setPaused(bool value) external {
        if (msg.sender != owner) revert Unauthorized();
        paused = value;
    }

    function withdrawBank(uint256 amount) external nonReentrant {
        if (msg.sender != owner) revert Unauthorized();
        if (amount > freeReserve()) revert InsufficientReserve();
        (bool ok,) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit BankWithdrawn(amount);
    }

    receive() external payable { emit BankFunded(msg.sender, msg.value); }
}
