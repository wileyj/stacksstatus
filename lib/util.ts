import { blocks, txs } from '@prisma/client';

export const apiRoot = 'https://api.hiro.so';

export const millisecondsPerHour = 60 * 60 * 1000;
export const millisecondsPerDay = 24 * millisecondsPerHour;

export function makeSerializable(o) {
  return JSON.parse(JSON.stringify(o));
}

export const getTimestampFromNow = (milliseconds: number) => {
  const now = new Date();
  const oldTimestamp = new Date(now.getTime() - milliseconds).getTime();
  return oldTimestamp;
};

export function convertEpoch(date) {
  const myDate = new Date(date * 1000);
  return myDate.toUTCString();
}

export const isProd = process.env.NODE_ENV === 'production';

// pages/api/user
export async function getData(url) {
  try {
    const response = await fetch(url, {
      next: { revalidate: isProd ? 90 : 0 },
    });
    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    console.error(`Couldn't fetch ${url}`, { error });
    return {};
  }
}

// brice.btc®
// https://github.com/obycode/stacks-stats/blob/main/static/js/block.js
// https://obycode.github.io/stacks-stats/block/
export type BlockExecutionCostDB = Pick<
  blocks,
  | 'index_block_hash'
  | 'execution_cost_read_count'
  | 'execution_cost_read_length'
  | 'execution_cost_runtime'
  | 'execution_cost_write_count'
  | 'execution_cost_write_length'
>;

export type TxExecutionCostDB = Pick<
  txs,
  | 'index_block_hash'
  | 'microblock_hash'
  | 'execution_cost_read_count'
  | 'execution_cost_read_length'
  | 'execution_cost_runtime'
  | 'execution_cost_write_count'
  | 'execution_cost_write_length'
  | 'fee_rate'
>;

export interface BlockExecutionCost {
  read_count: bigint;
  read_length: bigint;
  runtime: bigint;
  write_count: bigint;
  write_length: bigint;
  length: number;
}

export const blockLimits: BlockExecutionCost = {
  read_count: BigInt(15000),
  read_length: BigInt(100000000),
  runtime: BigInt(5000000000),
  write_count: BigInt(15000),
  write_length: BigInt(15000000),
  length: 2 * 1024 * 1024,
};

export const getCosts = (data: BlockExecutionCostDB | TxExecutionCostDB) => {
  const costs = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('execution_cost_')) {
      const shortenedKey = key.replace('execution_cost_', '');
      costs[shortenedKey] = value;
    }
  }
  return costs;
};

export const getBlockLen = async (block: BlockExecutionCostDB) => {
  const indexBlockHash = block.index_block_hash.toString('hex');
  const url = `https://api.mainnet.hiro.so/v2/blocks/${indexBlockHash}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to retrieve block: ${response.statusText}`);
  }
  const blob = await response.blob();
  return blob.size;
};

// The total costs reported for the block include the costs of the microblocks
// that it confirms, but those should actually count towards the budget of the
// previous block. This function will calculate the total costs of the current
// block, and also the total from the microblocks it confirms.
export const getTotalCosts = async (
  block: BlockExecutionCostDB,
  transactions: TxExecutionCostDB[]
) => {
  let blockTxs = 0;
  const blockCosts = {
    read_count: BigInt(0),
    read_length: BigInt(0),
    runtime: BigInt(0),
    write_count: BigInt(0),
    write_length: BigInt(0),
    length: 0,
  };
  let microblockTxs = 0;
  const microblockCosts = {
    read_count: BigInt(0),
    read_length: BigInt(0),
    runtime: BigInt(0),
    write_count: BigInt(0),
    write_length: BigInt(0),
    length: 0,
  };

  // When microblocks are confirmed, we need special handling because the API
  // incorrectly includes the costs of the microblock transactions with the
  // costs of the block that confirms them. Those costs actually count towards
  // the budget of the previous block.
  for (const transaction of transactions) {
    // This tx is in the anchor block
    if (transaction.microblock_hash.toString() === '') {
      blockTxs++;
      const costs = getCosts(transaction);
      Object.keys(costs).forEach((key) => {
        blockCosts[key] += costs[key];
      });
    } else {
      microblockTxs++;
      const costs = getCosts(transaction);
      Object.keys(costs).forEach((key) => {
        microblockCosts[key] += costs[key];
      });
    }
  }

  // Retrieve the tx_len of the block
  blockCosts.length = await getBlockLen(block);

  return { blockTxs, blockCosts, microblockTxs, microblockCosts };
};

export const getTotalFees = async (transactions: TxExecutionCostDB[]) => {
  const totalFees = transactions.reduce(
    (sum, transaction) => sum + parseInt(transaction.fee_rate.toString()),
    0
  );
  return totalFees;
};

export const capitalizeFirstLetter = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};
