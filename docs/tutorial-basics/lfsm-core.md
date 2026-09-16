---
sidebar_position: 4
tags:
  - lfsm
---

# LFSM Core

The core LFSM contracts concern the maintenance of LFSM rollups. Rollups are generated **every time a miner on Lithos finds a new block.**
Each LFSM Rollup is considered an *optimistic rollup*, which has three phases and five transformations. Each rollup state is represented by the AVL Tree in *R4* of the LFSM contract. This AVL Tree, called the *NISP Tree*, holds all NISPs submitted by miners to prove that they performed work.

## Holding Phase
The Holding phase is the initial state of an LFSM rollup. When a collateral UTXO is included in a mined block, it is spent to create a new UTXO under the *holding contract*. This UTXO has an empty AVL Tree in *R4*, along with zeroed values for the number of miners (*R5*),
and total score (*R6*). *R7* of the *holding contract* defines the start of the current phase, which is the blockheight of the mined block.

```scala title="holding.ergo"
  // REGISTERS
  // R4: NISP Tree, initially, an empty AVL Tree. AVL Tree of ( hashedPropBytes -> NISP )
  // R5: Total Miners (incremented every NISP posted) for this period
  // R6: Total Share Score (added to for every NISP posted, using given ShareScore from first 8 bytes of NISP)
  // NOTE: R6 is of type BigInt, but share scores are of type Long. This is NOT a tau representation of score!!!
  // It is simply the sum of all (Long) share scores stored in a BigInt value, so as to save blockchain space.
  // R7: Period Start (time or height of block mining in which this box was created, ex. during block mining and collateral exchange)
  
  val nispTree:      AvlTree = SELF.R4[AvlTree].get
  val currentMiners: Int     = SELF.R5[Int].get
  val totalScore:    Long    = SELF.R6[BigInt].get
  val currentPeriod: Long    = SELF.R7[Long].get
```

### NISP Submissions
While `HEIGHT < currentPeriod + HOLDING_PERIOD`, miners may submit NISPs to the holding contract. As the LFSM uses optimistic rollups,
minimal evaluation of NISPs occurs when submitted. **Only the first 8 bytes of the NISP are checked**, these bytes contain the score which is then added to the `totalScore` register on the holding contract output. Additionally, the digest of the NISP Tree and the value of `currentMiners` is updated.

### Holding Transformation
Once `HEIGHT >= currentPeriod + HOLDING_PERIOD`, NISP submissions to the contract are no longer accepted. At this point, any miner may perform the *holding transformation*, to transition the phase of this UTXO from `HOLDING` to `EVAL`. The transformation takes the holding contract and outputs a new *evaluation contract*. **All but two registers stay the same during this transformation.** *R7* is updated to the height of the blockchain at the time of the transformation. Additionally, the value of `currentPeriod` from the holding contract is copied into *R8* of the evaluation contract, as this is used in certain fraud proofs.

## Evaluation Phase
The `EVAL` state of an LFSM Rollup deals with the evaluation of all submitted NISPs. After the end of the `HOLDING` phase, all NISP submissions are closed down. At this point, miners running **Lithos clients will attempt to prove fraudulence for every single miner found in the NISP Tree.** To do this, miners must use one of the authenticated fraud proof contracts found in *R4* of the `FP_CONTROL` UTXO.

```scala title="evaluation.ergo"
  // REGISTERS
  // R4: NISP Tree, filled with submissions ( hashedPropBytes -> NISP )
  // R5: Total Miners (decremented after FP posted) for this period
  // R6: Total Share Score (subtracted from after valid FP is posted)
  // R7: Period Start (time or height of block mining in which this box was created, in this case after holding period.)
  // R8: Current Block (Period Start from holding contract)

  val nispTree:      AvlTree = SELF.R4[AvlTree].get
  val currentMiners: Int     = SELF.R5[Int].get
  val totalScore:    Long    = SELF.R6[BigInt].get
  val currentPeriod: Long    = SELF.R7[Long].get
  val currentBlock:  Long    = SELF.R8[Long].get

```

### Fraud Proof Application
Application of a fraud proof to an evaluation contract implies the existence of fraud for a certain miner. There are a number of
different fraud proofs which exist on the `FP_CONTROL` UTXO, each one checks certain aspects of a NISP to verify that a fraudulence occurred. Despite the differences between each fraud proof, all fraud proofs verify the following actions are performed after fraud is proven for a miner:
- The miner is removed from the NISP Tree
- The miner's score is subtracted from `totalScore`
- `currentMiners` is decremented by one

These actions ensure that a fraudulent miner's rewards are slashed, and that payout calculations remain correct in the next phase.

### Evaluation Transformation
Similar to the holding contract, fraud proof evaluation only occurs while `HEIGHT < currentPeriod + EVAL_PERIOD`. Once
`HEIGHT >= currentPeriod + EVAL_PERIOD`, the evaluation contract is ready to be transitioned to the `PAYOUT` state.
This transformation is quite simple, in that **almost all registers are conserved.** The only difference is that *R7* goes from
being `currentPeriod` to `blockReward` on the *payout contract*, with its value initialized to the total amount of ERG held in the evaluation contract. *R8* is not checked in the payout contract.

## Payout Phase
Once evaluation has completed, it is assumed that all remaining miners on the NISP Tree are truthful miners. At this point, it is time for miners to receive ERG for mining on the Lithos pool. Miners receive ERG according to the amount of work they performed. Work is measured using the `score` found in the first 8 bytes of miner's submitted NISP.

```scala title="payout.ergo"
  // REGISTERS
  // R4: NISP Tree, filled with miners which passed evaluation period ( hashedPropBytes -> NISP )
  // R5: Total Miners, constant on spend
  // R6: Total Share Score constant on spend
  // R7: Total block reward, equal to initial block value when transforming from EvalContract
  
  val nispTree:      AvlTree = SELF.R4[AvlTree].get
  val currentMiners: Int     = SELF.R5[Int].get
  val totalScore:    BigInt  = SELF.R6[BigInt].get
  val totalReward:   Long    = SELF.R7[Long].get
```

### Payout Application
Any miner may apply a transaction which performs payouts for any number of miners remaining in the NISP Tree. Once a payout is performed, the miner is removed from the NISP Tree so that duplicate payments do not occur. Payment is calculated in the following manner:
```
 ((totalReward.toBigInt * minerScore.toBigInt) / totalScore).toLong
```
If less than `0.001 ERG` remains in the payout contract, a miner may fully spend the payout utxo without creating a corresponding output for it.

