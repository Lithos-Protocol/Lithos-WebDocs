---
sidebar_position: 5
sidebar_label: Ergo Voting
tags: 
  - ergo
---

# Ergo Voting

Ergo allows miners to vote on various settings in blocks. Votes can be set in the node config file.

## Ergo Params

The table below lists all possible parameters miners can vote on in Ergo. 

|Id|Parameter|Default|Usage|
|-|---------|-----|-----|
|1|`Storage fee factor (per byte storage period)`|1250000|ERG per byte which can be charged on eligible storage rent UTXOs|
|2|`Minimum monetary value of a box`|360|Minimum amount of ERG per byte of a UTXO|
|3|`Maximum block size`|524288|Maximum number of bytes in a block|
|4|`Maximum block computation cost`|1000000|Maximum amount of computations that a block may have|
|5|`Token access cost`|100|Computational cost of tokens|
|6|`Cost per input`|2000|Computational cost of inputs|
|7|`Cost per data input`|100|Computational cost of data inputs|
|8|`Cost per output`|100|Computational cost of outputs|
|120|`Soft-fork`|N/A|Increases the block version for a soft fork|

