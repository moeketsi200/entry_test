// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title DecentralisedRaffle
 * @dev A raffle contract with a circuit breaker and a fair payout split
 * @notice PART 2 - Decentralised Raffle (MANDATORY)
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT: THE AUTO-MARKER CALLS THESE EXACT FUNCTION AND EVENT SIGNATURES.
 * Do not rename them, reorder their parameters, or change their return types.
 * You may add anything you like alongside them.
 * ---------------------------------------------------------------------------
 */
contract DecentralisedRaffle {
    // --- Events (the marker checks these are emitted) ---

    event RaffleEntered(address indexed player, uint256 entryCount);
    event WinnerSelected(uint256 indexed raffleId, address indexed winner, uint256 prize);
    event RafflePaused();
    event RaffleUnpaused();

    /// @notice The minimum a player must send for one entry
    uint256 public constant MINIMUM_ENTRY = 0.01 ether;

    /// @notice How long the raffle must run before a winner can be drawn
    uint256 public constant RAFFLE_DURATION = 24 hours;

    address public owner;
    uint256 public raffleId;
    uint256 public raffleStartTime;
    bool public isPaused;
    uint256 public uniquePlayerCount;

    address[] private entries;
    mapping(address => uint256) private entryCount;
    mapping(address => uint256) private playerRound;

    constructor() {
        owner = msg.sender;
        raffleId = 1;
        raffleStartTime = block.timestamp;
        isPaused = false;
        uniquePlayerCount = 0;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier whenNotPaused() {
        require(!isPaused, "Contract is paused");
        _;
    }

    // -----------------------------------------------------------------------
    // TODO 1: enterRaffle
    // -----------------------------------------------------------------------
    function enterRaffle() external payable whenNotPaused {
        require(msg.value >= MINIMUM_ENTRY, "Entry must be at least minimum entry");

        if (playerRound[msg.sender] != raffleId) {
            playerRound[msg.sender] = raffleId;
            entryCount[msg.sender] = 0;
            uniquePlayerCount++;
        }

        entryCount[msg.sender]++;
        entries.push(msg.sender);

        emit RaffleEntered(msg.sender, entryCount[msg.sender]);
    }

    // -----------------------------------------------------------------------
    // TODO 2: selectWinner
    // -----------------------------------------------------------------------
    function selectWinner() external onlyOwner {
        require(block.timestamp >= raffleStartTime + RAFFLE_DURATION, "Raffle duration has not passed");
        require(uniquePlayerCount >= 3, "At least 3 unique players required");
        require(entries.length > 0, "No entries");

        uint256 pot = address(this).balance;
        uint256 prizeAmount = (pot * 90) / 100;
        uint256 ownerAmount = pot - prizeAmount;

        uint256 randomNumber = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    msg.sender,
                    raffleId,
                    raffleStartTime,
                    block.timestamp
                )
            )
        );

        uint256 winningIndex = randomNumber % entries.length;
        address winner = entries[winningIndex];

        emit WinnerSelected(raffleId, winner, prizeAmount);

        raffleId++;
        raffleStartTime = block.timestamp;
        delete entries;
        uniquePlayerCount = 0;

        (bool successWinner, ) = winner.call{value: prizeAmount}("");
        require(successWinner, "Transfer to winner failed");

        (bool successOwner, ) = owner.call{value: ownerAmount}("");
        require(successOwner, "Transfer to owner failed");
    }

    // -----------------------------------------------------------------------
    // TODO 3: Circuit breaker
    // -----------------------------------------------------------------------
    function pause() external onlyOwner {
        require(!isPaused, "Contract is already paused");
        isPaused = true;
        emit RafflePaused();
    }

    function unpause() external onlyOwner {
        require(isPaused, "Contract is not paused");
        isPaused = false;
        emit RaffleUnpaused();
    }

    // -----------------------------------------------------------------------
    // TODO 4: View functions (the marker calls all four)
    // -----------------------------------------------------------------------

    /// @notice The current pot, in wei
    function getPot() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice How many entries this player has bought this round
    function getEntryCount(address player) external view returns (uint256) {
        if (playerRound[player] != raffleId) {
            return 0;
        }
        return entryCount[player];
    }

    /// @notice Total number of entries this round, counting repeats
    function getPlayerCount() external view returns (uint256) {
        return entries.length;
    }

    /// @notice Number of distinct addresses that have entered this round
    function getUniquePlayerCount() external view returns (uint256) {
        return uniquePlayerCount;
    }

    // BONUS (not auto-marked, describe it in PartB_Design.md instead):
    // - Refund everyone if the raffle closes with fewer than 3 players
    // - Multiple prize tiers (1st, 2nd, 3rd)
}
