import { LiquidUnitPosition } from '../common/positions/liquid-unit.position';
import type { PositionType, GranularityType } from '../common/types';

/**
 * Uniswap V3 implementation of the shared unit liquidity position logic.
 * Accepts feePercentage (e.g., '0.3%') and automatically determines tickSpacing.
 */
export class AerodromeLiquidPosition extends LiquidUnitPosition {
  /**
   * Constructor for UniswapLiquidUnitPosition.
   * Accepts feePercentage (e.g., '0.3%') and automatically determines tickSpacing.
   */
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
    tickSpacing: number = 2000,
    token0Decimals: number = 6,
    token1Decimals: number = 18,
    useCompoundingAPR: boolean = true,
  ) {
    super(
      initialAmount,
      positionType,
      initialTick,
      initialTvl,
      initialToken0Price,
      initialToken1Price,
      totalPoolLiquidity,
      token0Symbol,
      token1Symbol,
      granularityType,
      tickSpacing,
      token0Decimals,
      token1Decimals,
      useCompoundingAPR,
    );
  }

  /**
   * Static factory method for UniswapLiquidUnitPosition.
   * Accepts feePercentage (e.g., '0.3%') and automatically determines tickSpacing.
   *
   * Note: This intentionally does not match the base class static signature, as Uniswap uses feePercentage instead of tickSpacing.
   */
  static create(
    initialAmount: number,
    positionType: PositionType,
    initialTick: number,
    initialTvl: number,
    initialToken0Price: number,
    initialToken1Price: number,
    totalPoolLiquidity: number,
    token0Symbol: string,
    token1Symbol: string,
    granularityType: 'daily' | 'hourly' = 'daily',
    tickSpacing: number = 2000,
    token0Decimals: number = 6, // USDC (actual token0)
    token1Decimals: number = 8, // cbBTC (actual token1)
    useCompoundingAPR: boolean = true,
  ): AerodromeLiquidPosition {
    return new AerodromeLiquidPosition(
      initialAmount,
      positionType,
      initialTick,
      initialTvl,
      initialToken0Price,
      initialToken1Price,
      totalPoolLiquidity,
      token0Symbol,
      token1Symbol,
      granularityType,
      tickSpacing,
      token0Decimals,
      token1Decimals,
      useCompoundingAPR,
    );
  }
}
