# Part B: Design Document

**Marks:** 4 of 100 - the **Randomness** section below is read and marked. The
rest of this document is not scored, but it is read when we talk to you, so
answer it properly.

**Section 1: FreelanceBountyBoard**
**Section 2: DecentralisedRaffle**

Short, specific answers beat long vague ones. Three honest sentences score better
than a page of general security talk. If you ran out of time on something, say
so here - describing what you would have done still earns marks. Pretending it
is finished does not.

---

## WHY I BUILT IT THIS WAY

### 1. Data Structure Choices

- Where did you use a `mapping`, and where did you need an array instead?
- How did you record raffle entries so that a player who enters three times has
  three times the chance of winning?
- How did you count unique players separately from total entries?

**FreelanceBountyBoard:** I used mappings throughout because lookups by address or ID are the primary access pattern. `mapping(address => Freelance)` stores registration and skills, `mapping(uint256 => Bounty)` stores bounty details by ID, and `mapping(uint256 => mapping(address => bool))` tracks applications. I avoided arrays because I needed O(1) lookups.

**DecentralisedRaffle:** I used an array `entries[]` to record every entry (including repeats), so a player who enters three times appears three times in the array. When selecting the winner, I take `randomNumber % entries.length` to pick an index. I track unique players separately with `uniquePlayerCount` and `mapping(address => uint256) playerRound` that resets each round, allowing me to count distinct addresses vs. total entries.

---

### 2. Security Measures

- **Reentrancy:** show the order of operations in `approveAndPay`. Which line
  updates the status, and which line sends the ETH? Why that order?
- **Access control:** which functions are owner-only or employer-only, and what
  would go wrong without those checks?
- **Input validation:** what did you reject, and where?

**Reentrancy in approveAndPay:** The status is set to `Completed` *before* calling the freelancer's address. This is checks-effects-interactions: we first check that `msg.sender == b.employer` and `b.status == Submitted`, then update state (`b.status = Completed`), then interact with the external contract (`freelancer.call{value: paymentAmount}`). If the freelancer's fallback is malicious and tries to call `approveAndPay` again, it will fail because `b.status` is already `Completed`.

**Access control:** Only the employer can call `approveAndPay`, checked with `require(msg.sender == b.employer)`. Without this, any address could approve and pay themselves. Only the owner can call `pause()` and `unpause()` in the raffle; without these checks, anyone could pause the raffle. Only registered freelancers can apply; otherwise anyone could claim a skill they don't have. Only applicants can submit work; otherwise someone could claim credit for work they didn't do.

**Input validation:** I reject empty skill strings with `require(bytes(skill).length > 0)`. I reject zero bounty amounts with `require(msg.value > 0)`. I reject applications from unregistered addresses and non-matching skills. I reject premature winner selection with `require(block.timestamp >= raffleStartTime + RAFFLE_DURATION)` and `require(uniquePlayerCount >= 3)`.

---

### 3. Randomness - Be Honest Here (4 marks)

You were allowed to use block data for the raffle draw. This section is where
you show you understand what that costs.

- What exactly does your randomness depend on?
- **Who can manipulate it, and how?** Name the actor and the action.
- What would you use in production instead, and why is that better?

**What randomness depends on:** My raffle uses `keccak256(abi.encodePacked(block.prevrandao, msg.sender, raffleId, raffleStartTime, block.timestamp))` to generate a pseudorandom number. This mixes the block's randao value (which should be hard to predict), the caller's address, the raffle ID, and timestamps. I then use modulo arithmetic to pick a winner from the entries array.

**Who can manipulate it:** A **validator** (the block producer) can manipulate this. On Ethereum PoS, the validator building the block knows `block.prevrandao` and `block.timestamp` in advance. They can calculate what the hash will be before including the winner-selection transaction, then choose whether to include the block. If they are an entrant and the calculated winner is someone else, they simply don't build that block. Additionally, the **owner calling `selectWinner`** can partially control the outcome because `msg.sender` is part of the seed—they could wait for different blocks to change the result.

**Production alternative:** Use **Chainlink VRF** (Verifiable Random Function). VRF generates a cryptographic proof that the randomness is truly random and was generated before the outcome was known. The oracle provider cannot predict or manipulate the result. The chain can verify the proof. Trade-offs: you pay per request (~0.5 LINK ≈ $10) and wait 2-3 blocks for the answer, but for raffles with significant prize pools, this is worth it.

---

### 4. Trade-offs & Future Improvements

- What did you not finish, or knowingly do the quick way?
- What would you add with another day? (dispute resolution, refunds, prize
  tiers, gas optimisation)

**Quick decisions:** The raffle's randomness is the "quick way"—it works for learning but would lose trust in production. I also did not implement refunds if the raffle closes with fewer than 3 players; users would lose their money.

**With another day, I would add:** (1) Dispute resolution in FreelanceBountyBoard with a 7-day window and a simple arbiter voting to approve or refund work, (2) Automatic refunds if raffle closes with <3 players, (3) Multiple prize tiers (1st gets 60%, 2nd gets 20%, 3rd gets 10%), (4) Gas optimization by storing a Merkle root of entries instead of the full array, eliminating the expensive array deletion.

---

## REAL-WORLD DEPLOYMENT CONCERNS

> [!NOTE]
> These are **written questions only**. You are not deploying anything, and you
> do not need a wallet, a faucet or any test ETH to answer them. Reason it
> through in prose.

### 1. Gas Costs

- Which of your functions is the most expensive, and why?
- Roughly what would it cost a user at 20 gwei, with ETH at $3,000? (Use the
  same arithmetic as Part A Question 2.)
- Is that affordable for the users you would actually be building this for? If
  not, what would you change?

**Most expensive function:** `selectWinner()` is the heaviest at roughly 150,000 gas, because it performs random selection, updates multiple mappings and state variables, deletes the entries array, and makes two external calls (to winner and owner). `approveAndPay()` costs ~80,000 gas, and `registerFreelancer()` costs ~40,000 gas.

**Cost estimate:** 150,000 gas * 20 gwei/gas = 3,000,000 wei = 0.003 ETH. At $3,000/ETH: 0.003 * 3,000 = **$9 per raffle draw**. A freelancer transaction costs ~$0.48.

**Affordability:** For a learning exercise, these are acceptable. For real deployment on Mainnet, I would move to Layer 2 (Arbitrum or Optimism) where gas is 50-100x cheaper, making costs $0.09-$0.18 per raffle draw—very reasonable.

---

### 2. Scalability

**What happens when the raffle has 10,000 entries?**

- Which part of `selectWinner` gets slower or more expensive as the array grows?
- What breaks first?

**What breaks first:** Deleting the entries array. Each storage slot deletion costs ~20,000 gas. 10,000 entries = 10,000 addresses ≈ 10,000 storage slots. Total deletion cost: ~200 million gas, but a single Ethereum block has a ~30 million gas limit. **The transaction will always revert because it exceeds the block limit.**

**Technical detail:** The modulo operation (`randomNumber % entries.length`) is O(1) and stays cheap. The two external calls are O(1). But `delete entries` in Solidity zeros every slot in the array, which is O(N) storage operations. This is the bottleneck.

**Solution:** Don't store all entries on-chain. Instead: (1) Compute entries off-chain, hash them, and commit a Merkle root on-chain. (2) When selecting the winner, verify the winner's proof against the root. This makes `selectWinner` O(log N) in verification cost.

---

### 3. User Experience

**How would you make this usable for someone who has never held a wallet?**

- What is the hardest step for a first-time user?
- If you *were* deploying this for real, which testnet would you try it on
  first, and how would a tester get test ETH? (Describe it - you are not doing
  it.)

**Hardest step for a first-time user:** Creating a wallet and securely storing the seed phrase. Most users do not understand private key cryptography or how to write down a 12-word recovery phrase safely. **Solution:** Use social recovery wallets (like Argent or Safe) where a trusted friend or email can recover a lost account, or use account abstraction to let users log in with email/username while the app abstracts away the wallet complexity.

**For FreelanceBountyBoard specifically:** Most users will not hold ETH. I would accept credit card payments via Stripe or Wyre, bundle them into a single employer ETH deposit, and pay freelancers in USDC (a stablecoin). This way, employers and freelancers never touch raw ETH—they see prices in USD.

**Testing network:** I would deploy to **Sepolia**, Ethereum's longest-running public testnet. Testers would:
1. Create a MetaMask wallet (5 minutes).
2. Add Sepolia to MetaMask (one click from official docs).
3. Visit faucets.chain.link and get free Sepolia ETH.
4. Interact with the contract via Etherscan's write interface or a simple web UI (built with ethers.js).

After validating on Sepolia, I would move to **Arbitrum Sepolia** (Layer 2 testnet) to verify gas costs and UX at production scale, before considering Mainnet deployment.

---

## MY LEARNING APPROACH

### Resources I Used

Be specific. "The Cyfrin course" is not a resource; "Blockchain Basics, The
Oracle Problem" is. List 3-5.

1. **Cyfrin Updraft - Blockchain Basics** (Smart Contract Fundamentals, Solidity in Depth, Security & Reentrancy modules)
2. **Solidity by Example** (reentrancy attack patterns, visibility modifiers, event emission)
3. **OpenZeppelin Contracts** (standard patterns for access control, Checks-Effects-Interactions)
4. **Hardhat Official Documentation** (testing with ethers.js, contract deployment, console.log debugging)
5. **SOLCURITY Audit Checklist** (included in this repo: storage optimization, input validation, CEI pattern)

---

### Challenges Faced

- The biggest thing you got stuck on
- How you got unstuck
- What you know now that you did not this morning

**Biggest challenge:** Implementing reentrancy safety in `approveAndPay()`. I initially wrote the code to emit the event and send ETH *before* updating the bounty status to `Completed`. This allowed a malicious freelancer contract to re-enter the function and be paid multiple times for the same bounty.

**How I got unstuck:** I re-read the Solidity by Example page on reentrancy attacks and realized the pattern: you must update all state *before* making external calls. This is the "checks-effects-interactions" principle. I reordered the function to (1) check preconditions, (2) update `b.status = Completed`, (3) only then call `freelancer.call()`. Now if the freelancer tries to re-enter, the status check fails.

**What I know now:** Most reentrancy bugs are preventable with careful function ordering and don't require complex guard libraries. I also learned that `block.prevrandao` on Ethereum PoS is not truly random and can be gamed by block validators, making it unsuitable for high-value applications.

---

### What I'd Learn Next

1. **Chainlink VRF and Automation** – To build production raffles that are verifiably fair and automatically executed without manual calls.
2. **Account Abstraction (ERC-4337)** – To make blockchain apps usable for first-time users who don't understand wallets or gas.
3. **Optimistic Rollups and L2s** – To understand how systems like Arbitrum and Optimism achieve 100x gas efficiency while maintaining Ethereum security.
4. **Role-Based Access Control (OpenZeppelin)** – To move beyond simple owner checks to multi-role systems (admin, arbiter, moderator roles).
5. **Formal Verification with Certora** – To write mathematical proofs that my contracts are secure, rather than relying on manual review.

---
