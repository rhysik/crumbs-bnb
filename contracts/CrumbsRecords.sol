// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract CrumbsRecords {
    address public owner;
    address public scoreSigner;
    uint32 public season=1;
    bool public paused;
    mapping(bytes32=>bool) public usedRuns;
    mapping(uint32=>mapping(address=>uint32)) public bestScore;
    bytes32 private immutable DOMAIN;
    bytes32 private constant TYPEHASH=keccak256('Record(address player,uint32 score,uint32 season,bytes32 runId,uint64 deadline)');
    uint256 private constant HALF_ORDER=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    error Invalid();error Unauthorized();error UsedRun();error Expired();error WrongSeason();error Paused();
    event RecordSaved(address indexed player,uint32 indexed season,bytes32 indexed runId,uint32 score,uint8 badges);
    event SignerChanged(address indexed signer);event SeasonStarted(uint32 indexed season);event PauseChanged(bool paused);
    constructor(address signer){if(signer==address(0))revert Invalid();owner=msg.sender;scoreSigner=signer;DOMAIN=keccak256(abi.encode(keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),keccak256('CrumbsRecords'),keccak256('1'),block.chainid,address(this)));}
    function record(uint32 score,uint32 runSeason,bytes32 runId,uint64 deadline,bytes calldata signature) external {
        if(paused)revert Paused();if(runSeason!=season)revert WrongSeason();if(block.timestamp>deadline)revert Expired();if(usedRuns[runId])revert UsedRun();if(score==0||score>404||runId==bytes32(0)||signature.length!=65)revert Invalid();
        bytes32 r;bytes32 s;uint8 v;assembly{r:=calldataload(signature.offset) s:=calldataload(add(signature.offset,32)) v:=byte(0,calldataload(add(signature.offset,64)))}
        if(uint256(s)>HALF_ORDER||(v!=27&&v!=28))revert Invalid();
        bytes32 digest=keccak256(abi.encodePacked('\x19\x01',DOMAIN,keccak256(abi.encode(TYPEHASH,msg.sender,score,runSeason,runId,deadline))));
        address recovered=ecrecover(digest,v,r,s);if(recovered==address(0)||recovered!=scoreSigner)revert Unauthorized();
        usedRuns[runId]=true;if(score>bestScore[season][msg.sender])bestScore[season][msg.sender]=score;
        uint32 best=bestScore[season][msg.sender];emit RecordSaved(msg.sender,season,runId,score,best>=200?7:best>=120?3:1);
    }
    function badges(address player,uint32 runSeason) external view returns(uint8){uint32 best=bestScore[runSeason][player];return best>=200?7:best>=120?3:best>0?1:0;}
    function setSigner(address signer) external {if(msg.sender!=owner)revert Unauthorized();if(signer==address(0))revert Invalid();scoreSigner=signer;emit SignerChanged(signer);}
    function setPaused(bool value) external {if(msg.sender!=owner)revert Unauthorized();paused=value;emit PauseChanged(value);}
    function nextSeason() external {if(msg.sender!=owner)revert Unauthorized();season++;emit SeasonStarted(season);}
}
