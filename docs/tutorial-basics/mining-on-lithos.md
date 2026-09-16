---
sidebar_position: 6
tags:
  - mining
---

# Mining on Lithos
Due to Lithos being a decentralized mining pool, it operates in a completely different way compared to traditional pools. If you've already started mining to Lithos, you will have noticed that mining is completely offline, as the stratum server is spun up locally from the client. Additionally, you will have seen configuration options regarding `diff`. If your `diff` is low enough, logging messages about *super shares* will be seen in the terminal.

## Difficulty on Lithos
Lithos does not use traditional methods to evaluate how much work you performed. A normal mining pool may have payment schemes such as *Pay-Per-Share*(PPS) or *Pay-Per-Last-N-Shares*(PPLNS). These are tried and tested methods of paying out miners, however they all rely on using the number of shares a miner submitted as the main way of evaluating the amount of work. Because Lithos aims to be decentralized, relying on the number of shares is an unviable solution, as **it takes too much space on the blockchain to store large amounts of shares**.

## NISP Mining
Instead of using the above methods, Lithos uses *Non-Interactive Share Proofs*(NISPs) to evaluate your work. NISPs are a collection of 10 high-difficulty shares that are found while mining for a block. The presence of these *super shares* is enough to prove that you mined at a certain difficulty `diff`. On the Lithos client, you choose this value by changing the `diff` in your config file.

## Understanding `diff`
Your `diff` value is directly related to how much you get paid on Lithos. Higher values of `diff` mean higher payouts when mining to a Lithos pool. Alternatively, lowering your `diff` will result in lower payouts. It may seem simple to just maximize your `diff` to maximize your reward amount, however increasing your `diff` means that it will be harder for your miner to find *super shares*. In Lithos, **failure to provide 10 super shares at the time of submission will result in no payment**. Its important to optimize your `diff` value to find the balance between these two objectives. As a Lithos miner, your goal is to **maximize your `diff`** while ensuring **you can produce 10 super shares in the `NISP_WINDOW`**

## Starting Point

A good starting point for your `diff` value can be found with the following equation:
```
diff = (hashrate) * NISP_WINDOW_IN_SECONDS
```
