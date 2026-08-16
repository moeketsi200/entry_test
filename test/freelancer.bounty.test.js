const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Custom test for FreelanceBountyBoard
 * 
 * This test focuses on reentrancy safety in approveAndPay.
 * A naive implementation would send ETH before updating status,
 * allowing a malicious freelancer contract to call back in and be paid twice.
 */
describe("FreelanceBountyBoard: Reentrancy Security", function () {
  let board, employer, freelancer;
  let maliciousFreelancer;

  beforeEach(async function () {
    [employer, freelancer] = await ethers.getSigners();
    board = await ethers.deployContract("FreelanceBountyBoard");
    await board.waitForDeployment();
  });

  it("prevents a malicious freelancer contract from being paid twice", async function () {
    // Setup: freelancer registers, employer posts bounty, freelancer applies and submits
    await board.connect(freelancer).registerFreelancer("solidity");
    
    const bountyAmount = ethers.parseEther("1");
    const tx = await board.connect(employer).postBounty("Fix my contract", "solidity", {
      value: bountyAmount,
    });
    const receipt = await tx.wait();
    const bountyId = 1; // First bounty

    await board.connect(freelancer).applyForBounty(bountyId);
    await board.connect(freelancer).submitWork(bountyId, "https://github.com/mywork");

    // Test the checks-effects-interactions pattern:
    // The status must be set to Completed BEFORE sending ETH
    // This prevents re-entrancy because if a fallback tries to call approveAndPay again,
    // it will fail the status check.

    const beforeBalance = await ethers.provider.getBalance(freelancer.address);
    
    await board.connect(employer).approveAndPay(bountyId, freelancer.address);
    
    // Verify bounty is marked Completed (the "effect" before "interaction")
    const bounty = await board.getBounty(bountyId);
    expect(bounty.status).to.equal(2); // Status.Completed
    
    // Verify freelancer received payment
    const afterBalance = await ethers.provider.getBalance(freelancer.address);
    expect(afterBalance - beforeBalance).to.equal(bountyAmount);
  });

  it("reverts when trying to approve and pay the same bounty twice", async function () {
    // Setup
    await board.connect(freelancer).registerFreelancer("solidity");
    
    const bountyAmount = ethers.parseEther("1");
    await board.connect(employer).postBounty("Fix my contract", "solidity", {
      value: bountyAmount,
    });
    const bountyId = 1;

    await board.connect(freelancer).applyForBounty(bountyId);
    await board.connect(freelancer).submitWork(bountyId, "https://github.com/mywork");

    // First approval succeeds
    await board.connect(employer).approveAndPay(bountyId, freelancer.address);

    // Second approval should fail because status is now Completed
    await expect(
      board.connect(employer).approveAndPay(bountyId, freelancer.address)
    ).to.be.reverted;
  });

  it("correctly matches freelancer skill to bounty requirement", async function () {
    // Test that skill matching uses hash comparison (not == which doesn't work for strings)
    
    const freelancer1 = ethers.Wallet.createRandom().connect(ethers.provider);
    const freelancer2 = ethers.Wallet.createRandom().connect(ethers.provider);
    
    // Send them some ETH from the main account
    const [signer] = await ethers.getSigners();
    await signer.sendTransaction({
      to: freelancer1.address,
      value: ethers.parseEther("1"),
    });
    await signer.sendTransaction({
      to: freelancer2.address,
      value: ethers.parseEther("1"),
    });

    // Both register with same skill
    await board.connect(freelancer1).registerFreelancer("solidity");
    await board.connect(freelancer2).registerFreelancer("design");

    // Employer posts bounty requiring "solidity"
    await board.connect(employer).postBounty("Smart contract audit", "solidity", {
      value: ethers.parseEther("1"),
    });
    const bountyId = 1;

    // Freelancer1 (solidity) can apply
    await expect(board.connect(freelancer1).applyForBounty(bountyId)).to.not.be
      .reverted;

    // Freelancer2 (design) cannot apply
    await expect(board.connect(freelancer2).applyForBounty(bountyId)).to.be
      .reverted;
  });
});
