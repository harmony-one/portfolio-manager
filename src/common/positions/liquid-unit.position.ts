import type {
  PoolDayData,
  PoolHourData,
  PositionRange,
  PositionType,
  GranularityType,
} from '../types';

/**
 * Base class for unit-based liquidity position logic.
 * Subclasses must implement their own static create method.
 */
export class LiquidUnitPosition {
  protected initialAmount: number;
  protected currentPositionCapital: number;
  protected positionType: PositionType;
  protected positionRange: PositionRange;
  protected lpSharePercentage: number;
  protected tickSpacing: number;

  protected cumulativeFees: number = 0;
  protected dataPointsInRange: number = 0;
  protected totalDataPoints: number = 0;

  protected rebalanceCount: number = 0;
  protected totalGasCosts: number = 0;
  protected lastRebalanceDataPoint: number = 0;

  protected currentWasRebalanced: boolean = false;
  protected currentPositionDataPoints: number = 0;
  protected currentPositionFees: number = 0;
  protected currentTimestamp: number = 0;
  protected positionResults: Array<{
    duration: number;
    fees: number;
    gasCost: number;
    startingCapital: number;
  }> = [];

  protected currentToken0Price: number;
  protected currentToken1Price: number;
  protected initialToken0Price: number;
  protected initialToken1Price: number;
  protected currentBtcPrice: number; // Added for BTC price tracking
  protected totalPoolLiquidity: number;
  protected poolTVL: number;
  protected token0Decimals: number;
  protected token1Decimals: number;
  protected token0Symbol: string;
  protected token1Symbol: string;
  protected currentTick: number = 0;
  protected usdcAmount: number = 0;
  protected btcAmount: number = 0;
  protected liquidityAmount: number = 0;
  protected maxPortfolioValue: number = 0;
  protected minPortfolioValue: number = Number.MAX_VALUE;
  protected granularityType: GranularityType;
  protected useCompoundingAPR: boolean;
  assetComposition: string;

  protected previousFeeGrowth0X128: bigint = 0n;
  protected previousFeeGrowth1X128: bigint = 0n;

  constructor(
    initialAmount: number,
    positionType: PositionType,
    initialTick: number,
    initialTvl: number,
    initialToken0Price: number,
    initialToken1Price: number,
    totalPoolLiquidity: number,
    token0Symbol: string,
    token1Symbol: string,
    granularityType: GranularityType = 'daily',
    tickSpacing: number = 60,
    token0Decimals: number = 6,
    token1Decimals: number = 18,
    useCompoundingAPR: boolean = true,
  ) {
    this.assetComposition = `${token0Symbol},${token1Symbol}`;
    this.initialAmount = initialAmount;
    this.currentPositionCapital = initialAmount;
    this.positionType = positionType;
    this.totalPoolLiquidity = totalPoolLiquidity;
    this.initialToken0Price = initialToken0Price;
    this.initialToken1Price = initialToken1Price;
    this.currentToken0Price = initialToken0Price;
    this.currentToken1Price = initialToken1Price;
    // Set currentBtcPrice based on token symbols (assume BTC is token0 or token1)
    if (token0Symbol.toUpperCase().includes('BTC')) {
      this.currentBtcPrice = initialToken0Price;
    } else if (token1Symbol.toUpperCase().includes('BTC')) {
      this.currentBtcPrice = initialToken1Price;
    } else {
      this.currentBtcPrice = initialToken0Price; // fallback
    }
    this.tickSpacing = tickSpacing;
    this.currentTick = initialTick;
    this.token0Decimals = token0Decimals;
    this.token1Decimals = token1Decimals;
    this.token0Symbol = token0Symbol;
    this.token1Symbol = token1Symbol;
    this.useCompoundingAPR = useCompoundingAPR;
    this.poolTVL = initialTvl;
    this.granularityType = granularityType;
    this.positionRange = this.getPositionTickRange(
      initialTick,
      positionType,
      tickSpacing,
    );
    this.calculateTokensAndLiquidity(initialAmount, initialToken0Price);
  }

  /**
   * Calculates the tick range for the position based on the current tick, position type, and tick spacing.
   * Used to determine the active price range for the LP position.
   */
  protected getPositionTickRange(
    currentTick: number,
    positionType: PositionType,
    tickSpacing: number,
  ): PositionRange {
    if (positionType === 'full-range') {
      return {
        tickLower: -887272,
        tickUpper: 887272,
        priceLower: 0,
        priceUpper: Infinity,
        rangeWidth: Infinity,
      };
    }
    const rangePercent = parseInt(positionType.replace('%', '')) / 100;
    const currentPrice = this.currentToken0Price; // override if needed
    const priceLower = currentPrice * (1 - rangePercent / 2);
    const priceUpper = currentPrice * (1 + rangePercent / 2);
    const rawTickLower = this.getTickFromPrice(priceLower);
    const rawTickUpper = this.getTickFromPrice(priceUpper);
    const tickLower = Math.min(
      Math.floor(rawTickLower / tickSpacing) * tickSpacing,
      Math.floor(rawTickUpper / tickSpacing) * tickSpacing,
    );
    const tickUpper = Math.max(
      Math.ceil(rawTickLower / tickSpacing) * tickSpacing,
      Math.ceil(rawTickUpper / tickSpacing) * tickSpacing,
    );
    return {
      tickLower,
      tickUpper,
      priceLower,
      priceUpper,
      rangeWidth: rangePercent,
    };
  }

  /**
   * Converts a price to a Uniswap/Aerodrome tick index, accounting for token decimals.
   * Used for mapping price ranges to tick ranges.
   */
  protected getTickFromPrice(price: number): number {
    // Default: Uniswap/Aerodrome style
    const invertedPrice = 1 / price;
    const valToLog =
      invertedPrice * Math.pow(10, this.token1Decimals - this.token0Decimals);
    const tickIDXRaw = Math.log(valToLog) / Math.log(1.0001);
    return Math.round(tickIDXRaw);
  }

  /**
   * Calculates the token allocation and liquidity for the position based on the investment and price.
   * Determines how much of each token is needed and the resulting liquidity units.
   */
  protected calculateTokensAndLiquidity(
    investment: number,
    price: number,
  ): void {
    if (this.positionType === 'full-range') {
      const usdInToken1 = investment / 2;
      const usdInToken0 = investment / 2;
      this.usdcAmount = usdInToken0;
      this.btcAmount = usdInToken1 / price;
      const veryLowPrice = price * 0.01;
      const veryHighPrice = price * 100;
      this.liquidityAmount = this.liquidityForStrategy(
        price,
        veryLowPrice,
        veryHighPrice,
        this.btcAmount,
        this.usdcAmount,
      );
    } else {
      const decimal = this.token0Decimals - this.token1Decimals;
      [this.btcAmount, this.usdcAmount] = this.tokensForStrategy(
        this.positionRange.priceLower,
        this.positionRange.priceUpper,
        investment,
        price,
        decimal,
      );
      this.liquidityAmount = this.liquidityForStrategy(
        price,
        this.positionRange.priceLower,
        this.positionRange.priceUpper,
        this.btcAmount,
        this.usdcAmount,
      );
    }
    this.lpSharePercentage = this.liquidityAmount / this.totalPoolLiquidity;
  }

  /**
   * Calculates the amount of each token required for the strategy, given the price range and investment.
   * Returns [token0Amount, token1Amount].
   */
  protected tokensForStrategy(
    minRange: number,
    maxRange: number,
    investment: number,
    price: number,
    decimal: number,
  ): [number, number] {
    const sqrtPrice = Math.sqrt(price * Math.pow(10, decimal));
    const sqrtLow = Math.sqrt(minRange * Math.pow(10, decimal));
    const sqrtHigh = Math.sqrt(maxRange * Math.pow(10, decimal));
    let delta: number, amount0: number, amount1: number;
    if (sqrtPrice > sqrtLow && sqrtPrice < sqrtHigh) {
      delta =
        investment /
        (sqrtPrice -
          sqrtLow +
          (1 / sqrtPrice - 1 / sqrtHigh) * (price * Math.pow(10, decimal)));
      amount0 = delta * (1 / sqrtPrice - 1 / sqrtHigh) * Math.pow(10, decimal);
      amount1 = delta * (sqrtPrice - sqrtLow);
    } else if (sqrtPrice < sqrtLow) {
      delta = investment / ((1 / sqrtLow - 1 / sqrtHigh) * price);
      amount0 = delta * (1 / sqrtLow - 1 / sqrtHigh);
      amount1 = 0;
    } else {
      delta = investment / (sqrtHigh - sqrtLow);
      amount0 = 0;
      amount1 = delta * (sqrtHigh - sqrtLow);
    }
    return [amount0, amount1];
  }

  /**
   * Calculates the liquidity units for the strategy, given price bounds and token amounts.
   * Used to determine the LP's share of the pool.
   */
  protected liquidityForStrategy(
    price: number,
    low: number,
    high: number,
    tokens0: number,
    tokens1: number,
  ): number {
    const decimal = this.token0Decimals - this.token1Decimals;
    const lowHigh = [
      Math.sqrt(low * Math.pow(10, decimal)) * Math.pow(2, 96),
      Math.sqrt(high * Math.pow(10, decimal)) * Math.pow(2, 96),
    ];
    const sPrice = Math.sqrt(price * Math.pow(10, decimal)) * Math.pow(2, 96);
    const sLow = Math.min(...lowHigh);
    const sHigh = Math.max(...lowHigh);
    if (sPrice <= sLow) {
      return (
        tokens0 /
        ((Math.pow(2, 96) * (sHigh - sLow)) /
          sHigh /
          sLow /
          Math.pow(10, this.token0Decimals))
      );
    } else if (sPrice <= sHigh && sPrice > sLow) {
      const liq0 =
        tokens0 /
        ((Math.pow(2, 96) * (sHigh - sPrice)) /
          sHigh /
          sPrice /
          Math.pow(10, this.token1Decimals));
      const liq1 =
        tokens1 /
        ((sPrice - sLow) / Math.pow(2, 96) / Math.pow(10, this.token1Decimals));
      return Math.min(liq1, liq0);
    } else {
      return (
        tokens1 /
        ((sHigh - sLow) / Math.pow(2, 96) / Math.pow(10, this.token0Decimals))
      );
    }
  }

  /**
   * Processes a new data point (daily or hourly), updating position state and fee accruals.
   * Handles in-range checks, fee calculation, and portfolio value tracking.
   */
  update(
    dataPoint: PoolDayData | PoolHourData,
    wasRebalanced: boolean = false,
  ): number {
    this.totalDataPoints++;
    this.currentPositionDataPoints++;
    this.currentWasRebalanced = wasRebalanced;
    this.currentTick = parseInt(dataPoint.tick);
    this.currentToken0Price = parseFloat(dataPoint.token0Price);
    this.currentToken1Price = parseFloat(dataPoint.token1Price);
    // Update currentBtcPrice based on token symbols
    if (this.token0Symbol.toUpperCase().includes('BTC')) {
      this.currentBtcPrice = this.currentToken0Price;
    } else if (this.token1Symbol.toUpperCase().includes('BTC')) {
      this.currentBtcPrice = this.currentToken1Price;
    } else {
      this.currentBtcPrice = this.currentToken0Price; // fallback
    }
    this.currentTimestamp =
      this.granularityType === 'daily'
        ? (dataPoint as PoolDayData).date
        : (dataPoint as PoolHourData).periodStartUnix * 1000;
    const isInRange = !this.isOutOfRange(this.currentTick) && !wasRebalanced;
    const activeLiquidityPercent =
      this.calculateActiveLiquidityForCandle(dataPoint);
    let dataPointFees = 0;
    if (isInRange) {
      this.dataPointsInRange++;
      try {
        dataPointFees = this.calculateFeesUsingSimplifiedMethod(
          dataPoint,
          activeLiquidityPercent,
        );
      } catch (error) {
        // Optionally log
        dataPointFees = 0;
      }
    }
    this.cumulativeFees += dataPointFees;
    this.currentPositionFees += dataPointFees;
    const currentPositionValue = this.getCurrentPositionValue();
    const totalValue = currentPositionValue + this.cumulativeFees;
    this.maxPortfolioValue = Math.max(this.maxPortfolioValue, totalValue);
    if (this.maxPortfolioValue > this.initialAmount) {
      this.minPortfolioValue = Math.min(this.minPortfolioValue, totalValue);
    }
    return dataPointFees;
  }

  /**
   * Calculates the percentage of the period the position was active (in range) based on price action.
   * Used to scale fee accruals for partial in-range days/hours.
   */
  protected calculateActiveLiquidityForCandle(
    dataPoint: PoolDayData | PoolHourData,
  ): number {
    if (this.positionType === 'full-range') {
      return 100;
    }
    const low = parseFloat(dataPoint.low || dataPoint.token0Price);
    const high = parseFloat(dataPoint.high || dataPoint.token0Price);
    if (!isFinite(low) || !isFinite(high) || low <= 0 || high <= 0) {
      return 0;
    }
    const lowTick = this.getTickFromPrice(low);
    const highTick = this.getTickFromPrice(high);
    const minTick = this.positionRange.tickLower;
    const maxTick = this.positionRange.tickUpper;
    const divider = highTick - lowTick !== 0 ? highTick - lowTick : 1;
    const ratioTrue =
      highTick - lowTick !== 0
        ? (Math.min(maxTick, highTick) - Math.max(minTick, lowTick)) / divider
        : 1;
    const ratio = highTick > minTick && lowTick < maxTick ? ratioTrue * 100 : 0;
    return isNaN(ratio) || !ratio ? 0 : ratio;
  }

  /**
   * Calculates the fees earned for a data point using fee growth and active liquidity percent.
   * Handles both tokens and converts to USD value.
   */
  protected calculateFeesUsingSimplifiedMethod(
    dataPoint: PoolDayData | PoolHourData,
    activeLiquidityPercent: number,
  ): number {
    // Use Defilabs/Aerodrome logic for both protocols
    const currentFeeGrowth0 = BigInt(dataPoint.feeGrowthGlobal0X128);
    const currentFeeGrowth1 = BigInt(dataPoint.feeGrowthGlobal1X128);

    if (this.totalDataPoints === 1) {
      this.previousFeeGrowth0X128 = currentFeeGrowth0;
      this.previousFeeGrowth1X128 = currentFeeGrowth1;
      return 0;
    }

    // Calculate fee growth delta for each token
    const fg0 =
      Number(currentFeeGrowth0 - this.previousFeeGrowth0X128) /
      Math.pow(2, 128) /
      Math.pow(10, this.token0Decimals);
    const fg1 =
      Number(currentFeeGrowth1 - this.previousFeeGrowth1X128) /
      Math.pow(2, 128) /
      Math.pow(10, this.token1Decimals);

    // Calculate base fees (before scaling by LP share)
    const baseFeeToken0 =
      (fg0 * this.liquidityAmount * activeLiquidityPercent) / 100; // token0 fees
    const baseFeeToken1 =
      (fg1 * this.liquidityAmount * activeLiquidityPercent) / 100; // token1 fees

    // Convert to USD - token0 fees + (token1 fees * price)
    const feesUSD = baseFeeToken0 + baseFeeToken1 * this.currentToken0Price;

    this.previousFeeGrowth0X128 = currentFeeGrowth0;
    this.previousFeeGrowth1X128 = currentFeeGrowth1;
    return feesUSD;
  }

  /**
   * Checks if the position is currently out of range for a given tick.
   * Returns true if the position is not active.
   */
  isOutOfRange(currentTick: number): boolean {
    return !this.isPositionActive(currentTick);
  }

  /**
   * Checks if the position is active (in range) for a given tick.
   * Used internally for range logic.
   */
  protected isPositionActive(currentTick: number): boolean {
    return (
      currentTick >= this.positionRange.tickLower &&
      currentTick <= this.positionRange.tickUpper
    );
  }

  /**
   * Calculates the current USD value of the position based on token holdings and price.
   */
  getCurrentPositionValue(): number {
    const usdcValueInUsd = this.usdcAmount;
    const btcValueInUsd = this.btcAmount * this.currentBtcPrice;
    const totalValue = usdcValueInUsd + btcValueInUsd;
    return totalValue;
  }

  /**
   * Calculates impermanent loss as a percentage, comparing LP value to holding.
   */
  calculateImpermanentLoss(currentBtcPrice: number): number {
    const priceRatio = currentBtcPrice / this.initialToken0Price;
    const sqrtPriceRatio = Math.sqrt(priceRatio);
    const lpValue = (2 * sqrtPriceRatio) / (1 + priceRatio);
    const holdValue = 1;
    return (lpValue - holdValue) * 100;
  }

  /**
   * Rebalances the position, closing the current sub-period and starting a new one.
   * Updates capital, resets counters, and tracks gas costs.
   */
  rebalance(
    currentTick: number,
    currentTvl: number,
    gasCost: number = 0,
    isClosing: boolean = false,
  ): void {
    if (this.currentPositionDataPoints > 0) {
      this.positionResults.push({
        duration: this.currentPositionDataPoints,
        fees: this.currentPositionFees,
        gasCost: gasCost,
        startingCapital: this.currentPositionCapital,
      });
    }
    this.currentPositionCapital += this.currentPositionFees;
    if (!isClosing) {
      this.initialToken0Price = this.currentToken0Price;
      this.positionRange = this.getPositionTickRange(
        currentTick,
        this.positionType,
        this.tickSpacing,
      );
      this.calculateTokensAndLiquidity(
        this.currentPositionCapital,
        this.currentToken0Price,
      );
      this.totalGasCosts += gasCost;
      this.rebalanceCount++;
      this.lastRebalanceDataPoint = this.totalDataPoints;
    }
    this.currentPositionDataPoints = 0;
    this.currentPositionFees = 0;
  }

  /**
   * Returns the APR for the position, using either compounding (weighted) or running APR.
   */
  getAPR(): number {
    if (this.useCompoundingAPR) {
      if (this.positionResults.length > 0) {
        return this.getWeightedPositionAPR();
      }
    }
    return this.getRunningAPR();
  }

  /**
   * Calculates the running APR for the position over the entire period.
   */
  getRunningAPR(): number {
    if (this.totalDataPoints === 0) return 0;
    const netFees = this.cumulativeFees - this.totalGasCosts;
    if (this.granularityType === 'daily') {
      return (
        (netFees / this.initialAmount) * (365 / this.totalDataPoints) * 100
      );
    } else {
      return (
        (netFees / this.initialAmount) * (8760 / this.totalDataPoints) * 100
      );
    }
  }

  /**
   * Calculates the weighted APR across all completed sub-positions.
   */
  getWeightedPositionAPR(): number {
    // Include both completed positions AND current active position
    const allPositions = [...this.positionResults];

    // Add current active position if it has data points
    if (this.currentPositionDataPoints > 0) {
      allPositions.push({
        duration: this.currentPositionDataPoints,
        fees: this.currentPositionFees,
        gasCost: 0, // Current position hasn't incurred gas costs yet
        startingCapital: this.currentPositionCapital - this.currentPositionFees, // Capital at start of current position
      });
    }

    if (allPositions.length === 0) return 0;

    let totalWeightedAPR = 0;
    let totalDataPoints = 0;

    for (const position of allPositions) {
      const netFees = position.fees - position.gasCost;
      let netAPR: number;
      if (this.granularityType === 'daily') {
        netAPR =
          (netFees / position.startingCapital) *
          (365 / position.duration) *
          100;
      } else {
        netAPR =
          (netFees / position.startingCapital) *
          (8760 / position.duration) *
          100;
      }
      totalWeightedAPR += netAPR * position.duration;
      totalDataPoints += position.duration;
    }

    return totalDataPoints > 0 ? totalWeightedAPR / totalDataPoints : 0;
  }

  /**
   * Calculates the gross APR (before gas costs) for the position.
   */
  getGrossAPR(): number {
    if (this.totalDataPoints === 0) return 0;
    if (this.granularityType === 'daily') {
      return (
        (this.cumulativeFees / this.initialAmount) *
        (365 / this.totalDataPoints) *
        100
      );
    } else {
      return (
        (this.cumulativeFees / this.initialAmount) *
        (8760 / this.totalDataPoints) *
        100
      );
    }
  }

  /**
   * Returns the percentage of time the position was in range.
   */
  getTimeInRange(): number {
    return this.totalDataPoints === 0
      ? 0
      : (this.dataPointsInRange / this.totalDataPoints) * 100;
  }

  get totalFeesEarned(): number {
    return this.cumulativeFees;
  }
  get netFeesEarned(): number {
    return this.cumulativeFees - this.totalGasCosts;
  }
  get gasCostsTotal(): number {
    return this.totalGasCosts;
  }
  get rebalanceCountTotal(): number {
    return this.rebalanceCount;
  }
  get dataPointsActive(): number {
    return this.totalDataPoints;
  }
  get totalDataPointsInRange(): number {
    return this.dataPointsInRange;
  }
  get currentPositionDataPointsActive(): number {
    return this.currentPositionDataPoints;
  }
  get currentPositionFeesEarned(): number {
    return this.currentPositionFees;
  }
  get initialInvestment(): number {
    return this.initialAmount;
  }
  get positionLiquidityAmount(): number {
    return this.liquidityAmount;
  }
  get completedPositions(): Array<{
    duration: number;
    fees: number;
    gasCost: number;
    startingCapital: number;
  }> {
    return [...this.positionResults];
  }
  get tokenAmounts(): {
    token0: number;
    token1: number;
  } {
    return {
      token0: this.usdcAmount,
      token1: this.btcAmount,
    };
  }

  get positionInfo(): {
    type: PositionType;
    range: PositionRange;
    tickSpacing: number;
    sharePercentage: number;
  } {
    return {
      type: this.positionType,
      range: this.positionRange,
      tickSpacing: this.tickSpacing,
      sharePercentage: this.lpSharePercentage,
    };
  }

  /**
   * Returns a summary of the current position status, including PnL, APR, and other metrics.
   * Used for reporting and output.
   */
  currentStatus(isLastDataPoint: boolean = false): any {
    // Asset amounts - current token holdings
    const assetAmounts = `${this.btcAmount.toFixed(8)},${this.usdcAmount.toFixed(2)}`;
    // Return calculation: (current_value + total_fees - initial_investment) / initial_investment * 100
    const currentPositionValue = this.getCurrentPositionValue();
    const totalFeesEarned = this.cumulativeFees;
    const totalValue = currentPositionValue + totalFeesEarned;
    const returnPercentage =
      ((totalValue - this.initialAmount) / this.initialAmount) * 100;
    // Net gain vs hold: LP strategy value vs just holding the original 50/50 split
    const holdStrategyValue = this.calculateHoldStrategyValue();
    const netGainVsHold = totalValue - holdStrategyValue;
    // Capital used in trading: actual capital deployed in LP position
    const capitalUsedInTrading = currentPositionValue;
    const maxDrawdown =
      this.maxPortfolioValue > this.initialAmount
        ? ((this.maxPortfolioValue - this.minPortfolioValue) /
            this.maxPortfolioValue) *
          100
        : 0;
    const maxGain =
      ((this.maxPortfolioValue - this.initialAmount) / this.initialAmount) *
      100;
    let notes = '';
    if (this.totalDataPoints === 1) {
      notes = 'Start';
    } else if (this.currentWasRebalanced) {
      notes = 'Rebalanced';
    } else if (isLastDataPoint) {
      notes = 'End';
    }
    return {
      timestamp: this.currentTimestamp,
      assetComposition: this.assetComposition,
      assetAmounts,
      btcPrice: this.currentBtcPrice,
      totalPortfolioValue: totalValue,
      pnl: totalValue - this.initialAmount,
      return: returnPercentage,
      apr: this.getAPR(),
      netGainVsHold,
      capitalUsedInTrading,
      totalCapitalLocked: currentPositionValue,
      lpFeesEarned: this.cumulativeFees,
      tradingFeesPaid: 0, // LP doesn't do trading, only rebalancing (which is gas)
      gasFeesPaid: this.totalGasCosts,
      maxDrawdown,
      maxGain,
      impermanentLoss: this.calculateImpermanentLoss(this.currentBtcPrice),
      assetExposure: 0, // No hedging in pure LP strategy
      rebalancingActions: this.rebalanceCount,
      notes,
    };
  }

  /**
   * Helper for currentStatus: calculates the value of a hold strategy (no LP, just holding tokens).
   */
  private calculateHoldStrategyValue(): number {
    // Calculate original token amounts based on initial 50/50 split
    const initialToken1UsdValue = this.initialAmount / 2;
    const initialToken0Value = this.initialAmount / 2;
    // Original token amounts at initial price
    const originalToken1Amount =
      initialToken1UsdValue / this.initialToken0Price;
    const originalToken0Amount = initialToken0Value;
    // Current value of those original holdings
    const currentToken1Value = originalToken1Amount * this.currentToken0Price;
    const currentToken0Value = originalToken0Amount; // token0 maintains value
    return currentToken1Value + currentToken0Value;
  }
}
