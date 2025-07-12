export interface UnifiedOutputStatus {
  timestamp: number; // Unix timestamp of the data point
  assetComposition: string; // Comma-separated asset symbols (e.g., "cbBTC,USDC")
  assetAmounts: string; // Comma-separated asset amounts (e.g., "1.0,110000")
  btcPrice: number;
  totalPortfolioValue: number; // Combined value of all assets (LP position, hedge PnL, etc.)
  pnl: number; // Absolute profit/loss since inception in USD
  return: number; // Cumulative return as percentage of starting capital
  apr: number;
  netGainVsHold: number; // Total profit/loss of strategy compared to holding the assets
  capitalUsedInTrading: number; // Actual capital actively deployed (including margin/collateral for hedges)
  totalCapitalLocked: number; // All capital locked in LP, hedge collateral, and buffers
  lpFeesEarned: number; // Total fees earned from providing liquidity
  tradingFeesPaid: number; // Total trading fees paid for rebalancing and hedging
  gasFeesPaid: number; // Total transaction (gas) fees paid on-chain in USD
  maxDrawdown: number; // Largest observed peak-to-trough loss as percentage
  maxGain: number; // Largest observed gain relative to starting value as percentage
  impermanentLoss: number; // Cumulative impermanent loss as percentage of capital
  assetExposure: number; // Current hedge exposure as percentage of the position
  rebalancingActions: number; // Number of rebalancing events taken up to this point
  notes: string; // Descriptive notes (e.g., "Start", "Rebalanced", "End")
}

export interface PoolDayData {
  date: number;
  volumeUSD: string;
  feesUSD: string;
  tvlUSD: string;
  token0Price: string;
  token1Price: string;
  tick: string;
  liquidity: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  high: string;
  low: string;
  sqrtPrice: string;
}

export interface PoolHourData {
  id: string;
  periodStartUnix: number;
  liquidity: string;
  sqrtPrice: string;
  token0Price: string;
  token1Price: string;
  tick: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  tvlUSD: string;
  volumeToken0: string;
  volumeToken1: string;
  volumeUSD: string;
  feesUSD: string;
  txCount: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface PositionRange {
  tickLower: number;
  tickUpper: number;
  rangeWidth: number;
  priceLower: number;
  priceUpper: number;
}

export type PositionType = 'full-range' | `${number}%`;
export type GranularityType = 'daily' | 'hourly';
