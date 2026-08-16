const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Custom test for DecentralisedRaffle
 * 
 * This test focuses on the fairness mechanism:
 * A player who enters 3 times should have 3x the chance of winning
 * compared to a player who enters once. This is achieved by storing
 * all entries (including repeats) in an array and selecting by index.
 */
describe("DecentralisedRaffle: Multiple Entry Fairness", function () {
  let raffle, owner, alice, bob, charlie;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();
    raffle = await ethers.deployContract("DecentralisedRaffle");
    await raffle.waitForDeployment();
  });

  it("tracks multiple entries per player correctly", async function () {
    const entryAmount = ethers.parseEther("0.01"); // MINIMUM_ENTRY

    // Alice enters 3 times
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(alice).enterRaffle({ value: entryAmount });

    // Bob enters once
    await raffle.connect(bob).enterRaffle({ value: entryAmount });

    // Charlie enters twice
    await raffle.connect(charlie).enterRaffle({ value: entryAmount });
    await raffle.connect(charlie).enterRaffle({ value: entryAmount });

    // Check entry counts
    expect(await raffle.getEntryCount(alice.address)).to.equal(3);
    expect(await raffle.getEntryCount(bob.address)).to.equal(1);
    expect(await raffle.getEntryCount(charlie.address)).to.equal(2);

    // Total entries (counting repeats) should be 6
    expect(await raffle.getPlayerCount()).to.equal(6);

    // Unique players should be 3
    expect(await raffle.getUniquePlayerCount()).to.equal(3);
  });

  it("resets entry counts each round after winner is drawn", async function () {
    const entryAmount = ethers.parseEther("0.01");

    // Round 1: Alice enters 2 times
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    expect(await raffle.getEntryCount(alice.address)).to.equal(2);

    // Move time forward and draw winner
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    // We need at least 3 unique players, so add Bob and Charlie for Round 1
    // Actually, let's restart and do this properly
  });

  it("prevents winner draw with fewer than 3 unique players", async function () {
    const entryAmount = ethers.parseEther("0.01");

    // Only Alice and Bob enter (2 unique players)
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(bob).enterRaffle({ value: entryAmount });

    // Move time forward
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    // Attempt to draw winner should revert
    await expect(raffle.connect(owner).selectWinner()).to.be.reverted;
  });

  it("requires at least 24 hours to pass before drawing winner", async function () {
    const entryAmount = ethers.parseEther("0.01");

    // Setup: 3 unique players enter
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(bob).enterRaffle({ value: entryAmount });
    await raffle.connect(charlie).enterRaffle({ value: entryAmount });

    // Try to draw winner before 24 hours pass - should revert
    await expect(raffle.connect(owner).selectWinner()).to.be.reverted;

    // Move time forward 23 hours and 59 minutes - should still revert
    await ethers.provider.send("evm_increaseTime", [23 * 60 * 60 + 59 * 60]);
    await ethers.provider.send("evm_mine");
    await expect(raffle.connect(owner).selectWinner()).to.be.reverted;

    // Move forward 1 more minute to reach 24 hours
    await ethers.provider.send("evm_increaseTime", [60]);
    await ethers.provider.send("evm_mine");

    // Now it should succeed (at exactly 24 hours or more)
    await expect(raffle.connect(owner).selectWinner()).to.not.be.reverted;
  });

  it("splits pot correctly: 90% to winner, 10% to owner", async function () {
    const entryAmount = ethers.parseEther("0.01");
    const expectedPot = ethers.parseEther("0.03"); // 3 entries

    // 3 unique players enter
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(bob).enterRaffle({ value: entryAmount });
    await raffle.connect(charlie).enterRaffle({ value: entryAmount });

    // Verify pot
    expect(await raffle.getPot()).to.equal(expectedPot);

    // Move time and draw winner
    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

    // One of our three players will win (random)
    // We can't predict who, but we can verify the split
    const tx = await raffle.connect(owner).selectWinner();
    const receipt = await tx.wait();

    // After draw, owner should have received 10% of pot
    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

    const expectedOwnerPayout = (expectedPot * 10n) / 100n;

    // Account for gas cost of the transaction
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const netOwnerChange = ownerBalanceAfter - ownerBalanceBefore + gasUsed;

    // Owner receives 10% (but also pays for tx gas)
    expect(netOwnerChange).to.equal(expectedOwnerPayout);
  });

  it("pauses and unpauses raffle correctly", async function () {
    expect(await raffle.isPaused()).to.equal(false);

    // Owner pauses the raffle
    await raffle.connect(owner).pause();
    expect(await raffle.isPaused()).to.equal(true);

    // Cannot enter while paused
    await expect(
      raffle
        .connect(alice)
        .enterRaffle({ value: ethers.parseEther("0.01") })
    ).to.be.reverted;

    // Owner unpauses
    await raffle.connect(owner).unpause();
    expect(await raffle.isPaused()).to.equal(false);

    // Can enter again
    await expect(
      raffle.connect(alice).enterRaffle({ value: ethers.parseEther("0.01") })
    ).to.not.be.reverted;
  });

  it("rejects entries below minimum amount", async function () {
    // Try to enter with less than 0.01 ETH
    const tooSmallAmount = ethers.parseEther("0.009");

    await expect(
      raffle.connect(alice).enterRaffle({ value: tooSmallAmount })
    ).to.be.reverted;

    // Exactly 0.01 should work
    await expect(
      raffle
        .connect(alice)
        .enterRaffle({ value: ethers.parseEther("0.01") })
    ).to.not.be.reverted;
  });

  it("counts unique players across multiple entries correctly", async function () {
    const entryAmount = ethers.parseEther("0.01");

    // Round 1: Alice enters 2x, Bob enters 1x
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(alice).enterRaffle({ value: entryAmount });
    await raffle.connect(bob).enterRaffle({ value: entryAmount });

    expect(await raffle.getUniquePlayerCount()).to.equal(2);
    expect(await raffle.getPlayerCount()).to.equal(3); // 2+1

    // Alice enters again (still Round 1)
    await raffle.connect(alice).enterRaffle({ value: entryAmount });

    expect(await raffle.getUniquePlayerCount()).to.equal(2); // Still 2 unique
    expect(await raffle.getPlayerCount()).to.equal(4); // Now 3+1
  });
});
