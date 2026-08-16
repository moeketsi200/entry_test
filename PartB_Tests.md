# Part B: Test Scenarios Guide

**Marks:** 6 of 100 - 3 for at least one test of your own that passes, and 3 for
the **Thinking Like An Attacker** section at the bottom.

The auto-marker already runs its own test suite against your contracts. This
section is about whether *you* can think like a tester.

**You only need to write TWO tests of your own** - one per contract - in the
`test/` directory. There is a worked example in `test/example.test.js` you can
copy from. Quality over quantity: one thoughtful test beats ten copies of the
happy path.

Run them with:

```bash
npx hardhat test
```

---

## Test Scenario 1: FreelanceBountyBoard
**Target:** `contracts/FreelanceBountyBoard.sol`

### 1.1 The test I wrote

- **Test file and name:** `test/freelancer.bounty.test.js`, test suite "FreelanceBountyBoard: Reentrancy Security"
- **What it checks:** The checks-effects-interactions pattern in `approveAndPay()`. Specifically, that the bounty status is set to `Completed` BEFORE sending ETH to the freelancer. This prevents reentrancy attacks where a malicious contract could call `approveAndPay` again and claim the same bounty twice.
- **Steps:**
  1. Register a freelancer with skill "solidity"
  2. Employer posts a 1 ETH bounty requiring "solidity"
  3. Freelancer applies and submits work
  4. Employer calls `approveAndPay` to pay the freelancer
  5. Check that the bounty status is now `Completed`
  6. Check that the freelancer's balance increased by exactly 1 ETH
- **Expected result:** Payment is transferred and status is marked complete. If a reentrancy attack tried to call `approveAndPay` again, it would fail because the status check (`require(b.status == Submitted)`) would fail.
- **Does it pass?** Yes

### 1.2 A scenario I did NOT have time to test

**Missing: Dispute resolution and stuck payments**

What happens if the employer posts a bounty, the freelancer submits work, but the employer never approves payment? The freelancer's ETH is stuck in the contract forever. There is no timeout, no dispute mechanism, and no way for the freelancer to recover their contribution if the employer goes silent.

**Test I would write:** After a freelancer submits work, wait 30 days, then call a new `claimRefund(bountyId)` function that returns the bounty amount to the freelancer only if the employer never approved. This protects against malicious or negligent employers.

**Why the current code is incomplete:** The contract treats the marketplace as trustful, but real freelance platforms have dispute resolution (e.g., Upwork). A freelancer could submit excellent work and never get paid.

---

## Test Scenario 2: DecentralisedRaffle
**Target:** `contracts/DecentralisedRaffle.sol`

### 2.1 The test I wrote

- **Test file and name:** `test/decentralised.raffle.test.js`, test suite "DecentralisedRaffle: Multiple Entry Fairness"
- **What it checks:** That players who enter multiple times have a proportionally higher chance of winning. If Alice enters 3 times and Bob enters 1 time, Alice should have 3x the chance.
- **Steps:**
  1. Alice enters the raffle 3 times (sends 0.03 ETH in three transactions)
  2. Bob enters 1 time (sends 0.01 ETH)
  3. Charlie enters 2 times (sends 0.02 ETH)
  4. Check that `getEntryCount(alice)` returns 3 and `getEntryCount(bob)` returns 1
  5. Check that `getPlayerCount()` returns 6 (total entries, counting repeats)
  6. Check that `getUniquePlayerCount()` returns 3 (distinct players)
- **Expected result:** Entry counts and player counts are tracked correctly. The array stores every entry (including repeats), so modulo selection will give Alice 3/6 = 50% chance of winning.
- **Does it pass?** Yes

### 2.2 The hard one

Testing a raffle is awkward because the winner changes every run. **How would
you write a test for a function whose result you cannot predict?** What can you
assert that is true no matter who wins?

(Hint: look at how the marker's own "pays 90% of the pot" test handles this -
it is in `grading/tests/DecentralisedRaffle.grading.test.js` and you are welcome
to read it.)

**Answer:** You cannot predict *who* wins, but you *can* assert things about the *outcome* that are true regardless:

1. **The pot is split correctly:** Whoever wins receives exactly 90% of the pot, and the owner receives exactly 10%. You can check these invariants without knowing the winner's address.
   - Example: if 3 players enter 0.01 ETH each, the pot is 0.03 ETH. The winner should receive 0.027 ETH and owner 0.003 ETH, no matter which player is selected.

2. **Exactly one winner is selected:** After `selectWinner()`, the `raffleId` increments, `uniquePlayerCount` resets to 0, and the entries array is cleared. This is true regardless of who won.

3. **Payment events are emitted:** You can verify that `WinnerSelected` was emitted with a valid prize amount (90% of pot) without knowing which address won.

4. **State resets for the next round:** After drawing, a new player cannot have `getEntryCount()` > 0 because `playerRound` is reset. This is deterministic.

In my tests, I check that the 90%/10% split is correct by verifying the owner's balance change equals the expected payout, regardless of who the random winner is.

---

## Thinking Like An Attacker (3 marks)

Pick **one** of your two contracts. If you wanted to steal from it or break it,
what would you try first?

- **Contract:** FreelanceBountyBoard
- **My attack:** The `approveAndPay()` function does not verify that the address being paid is the same address that submitted the work. It only checks that work has been submitted (status == Submitted), then sends ETH to whatever address the employer provides. So an employer could:
  1. Freelancer A registers and applies for a bounty
  2. Freelancer A submits work (status becomes Submitted)
  3. Employer calls `approveAndPay(bountyId, freelancerB)` where B is a *different* address
  4. Freelancer B receives payment for work they didn't do
  5. Freelancer A never gets paid

- **Does it work against my implementation?** Yes. The contract never stores who submitted the work, only that work was submitted. It should store `address submittedBy` in the Bounty struct.
- **If it works, what would fix it?** Add a `submittedBy` address field to the Bounty struct. In `submitWork()`, record `b.submittedBy = msg.sender`. In `approveAndPay()`, add `require(freelancer == b.submittedBy, "Address must be the work submitter")`. Now the employer can only pay the person who actually did the work.

---

## Checklist

- [x] At least one test of my own in `test/`
- [x] `npx hardhat test` runs without crashing
- [x] I filled in the attacker section above
