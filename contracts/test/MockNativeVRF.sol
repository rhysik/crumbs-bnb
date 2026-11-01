// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IConsumer { function rawFulfillRandomWords(uint256, uint256[] calldata) external; }
contract MockNativeVRF {
    uint256 public fee = 0.00003 ether;
    uint256 public next = 1;
    mapping(uint256 => address) public consumer;
    function setFee(uint256 value) external { fee = value; }
    function calculateRequestPriceNative(uint32, uint32) external view returns(uint256) { return fee; }
    function requestRandomWordsInNative(uint32, uint16, uint32, bytes calldata extra) external payable returns(uint256 id) {
        require(msg.value == fee && extra.length == 36);
        id = next++;
        consumer[id] = msg.sender;
    }
    function fulfill(uint256 id, uint256 value) external {
        uint256[] memory words = new uint256[](1);
        words[0] = value;
        IConsumer(consumer[id]).rawFulfillRandomWords(id, words);
    }
}
