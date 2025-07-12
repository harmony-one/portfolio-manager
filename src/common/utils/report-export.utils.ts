import * as fs from 'fs';
import * as path from 'path';
import { UnifiedOutputStatus } from '../types';
import { logger } from './common.utils';

// Column configuration interface
interface ColumnConfig {
  name: string;
  padEnd: number;
  type: 'number' | 'string';
  fixed?: number;
  headerConsole: string;
  dataType: string; // Added dataType property
}

export class ExportUtils {
  private readonly exportsPath = path.join(process.cwd(), 'exports');
  private readonly protocolExportsPath: string;

  constructor(private readonly protocolName: string) {
    this.protocolExportsPath = path.join(this.exportsPath, protocolName);
    this.ensureExportsFolder();
  }

  private ensureExportsFolder(): void {
    if (!fs.existsSync(this.exportsPath)) {
      fs.mkdirSync(this.exportsPath, { recursive: true });
    }
    if (!fs.existsSync(this.protocolExportsPath)) {
      fs.mkdirSync(this.protocolExportsPath, { recursive: true });
    }
  }

  // Centralized column configuration
  private getColumnConfigs(): ColumnConfig[] {
    return [
      { name: 'timestamp', padEnd: 12, type: 'string', headerConsole: 'time', dataType: 'unix' },
      {
        name: 'asset_composition',
        padEnd: 12,
        type: 'string',
        headerConsole: 'assets',
        dataType: 'text',
      },
      {
        name: 'asset_amounts',
        padEnd: 18,
        type: 'string',
        headerConsole: 'amounts',
        dataType: 'amounts',
      },
      {
        name: 'btc_price',
        padEnd: 18,
        type: 'string',
        headerConsole: 'btc',
        dataType: '$',
      },
      {
        name: 'total_portfolio_value',
        padEnd: 10,
        type: 'number',
        fixed: 0,
        headerConsole: 'value',
        dataType: '$',
      },
      {
        name: 'pnl',
        padEnd: 8,
        type: 'number',
        fixed: 0,
        headerConsole: 'pnl',
        dataType: '$',
      },
      {
        name: 'return',
        padEnd: 8,
        type: 'number',
        fixed: 3,
        headerConsole: 'return%',
        dataType: '%',
      },
      {
        name: 'apr',
        padEnd: 8,
        type: 'number',
        fixed: 3,
        headerConsole: 'apr%',
        dataType: '%',
      },
      {
        name: 'net_gain_vs_hold',
        padEnd: 8,
        type: 'number',
        fixed: 0,
        headerConsole: 'vs_hold',
        dataType: '$',
      },
      {
        name: 'capital_used_in_trading',
        padEnd: 10,
        type: 'number',
        fixed: 0,
        headerConsole: 'cap_used',
        dataType: '$',
      },
      {
        name: 'total_capital_locked',
        padEnd: 10,
        type: 'number',
        fixed: 0,
        headerConsole: 'cap_lock',
        dataType: '$',
      },
      {
        name: 'lp_fees_earned',
        padEnd: 8,
        type: 'number',
        fixed: 2,
        headerConsole: 'lp_fees',
        dataType: '$',
      },
      {
        name: 'trading_fees_paid',
        padEnd: 8,
        type: 'number',
        fixed: 0,
        headerConsole: 'trade_fee',
        dataType: '$',
      },
      {
        name: 'gas_fees_paid',
        padEnd: 8,
        type: 'number',
        fixed: 0,
        headerConsole: 'gas_fee',
        dataType: '$',
      },
      {
        name: 'max_drawdown',
        padEnd: 8,
        type: 'number',
        fixed: 3,
        headerConsole: 'max_dd%',
        dataType: '%',
      },
      {
        name: 'max_gain',
        padEnd: 8,
        type: 'number',
        fixed: 3,
        headerConsole: 'max_gain%',
        dataType: '%',
      },
      {
        name: 'impermanent_loss',
        padEnd: 8,
        type: 'number',
        fixed: 3,
        headerConsole: 'il%',
        dataType: '%',
      },
      {
        name: 'asset_exposure',
        padEnd: 8,
        type: 'number',
        fixed: 0,
        headerConsole: 'exposure%',
        dataType: '%',
      },
      {
        name: 'rebalancing_actions',
        padEnd: 6,
        type: 'string',
        headerConsole: 'rebal',
        dataType: '#',
      },
      { name: 'notes', padEnd: 10, type: 'string', headerConsole: 'notes', dataType: 'text' },
    ];
  }

  // Get headers for TSV (full names)
  getOutputHeaders(): string[] {
    return this.getColumnConfigs().map((col) => `${col.name}${col.dataType ? ` (${col.dataType})` : ''}`);
  }

  // Print formatted header for console (short names)
  printConsoleHeader(): void {
    const configs = this.getColumnConfigs();
    const headerRow = configs
      .map((col) => col.headerConsole.padEnd(col.padEnd))
      .join(' | ');
    logger.log('');
    logger.log(headerRow);
    logger.log('-'.repeat(headerRow.length));
  }

  // Format row for console with column configs
  formatConsoleRow(status: UnifiedOutputStatus): string {
    const configs = this.getColumnConfigs();
    const values = this.getStatusValues(status);

    return configs
      .map((col, i) => {
        let value = values[i];

        // Apply number formatting if specified
        if (
          col.type === 'number' &&
          typeof value === 'number' &&
          col.fixed !== undefined
        ) {
          value = value.toFixed(col.fixed);
        }

        return value.toString().padEnd(col.padEnd);
      })
      .join(' | ');
  }

  // Extract values from status in column order
  private getStatusValues(status: UnifiedOutputStatus): (string | number)[] {
    return [
      status.timestamp,
      status.assetComposition,
      status.assetAmounts,
      status.btcPrice,
      status.totalPortfolioValue,
      status.pnl,
      status.return,
      status.apr,
      status.netGainVsHold,
      status.capitalUsedInTrading,
      status.totalCapitalLocked,
      status.lpFeesEarned,
      status.tradingFeesPaid,
      status.gasFeesPaid,
      status.maxDrawdown,
      status.maxGain,
      status.impermanentLoss,
      status.assetExposure,
      status.rebalancingActions,
      status.notes || '',
    ];
  }

  // Generate filename with protocol and token parameters
  generateTsvFilename(...parameters: string[]): string {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .substring(0, 15); // YYYYMMDD_HHMMSS

    // Clean parameters: remove dashes, replace % to pct, convert to lowercase
    const cleanedParameters = parameters.map((param) =>
      param.toLowerCase().replace(/-/g, '').replace(/%/g, 'pct'),
    );

    // Create filename: [protocolName]_parameter1_parameter2_..._parameterN_timestamp.tsv
    const parameterString =
      cleanedParameters.length > 0 ? `_${cleanedParameters.join('_')}` : '';
    return `${this.protocolName.toLowerCase()}${parameterString}_${timestamp}.tsv`;
  }

  // Export unified output format
  exportTsv(filename: string, data: UnifiedOutputStatus[]): void {
    const fullPath = path.join(this.protocolExportsPath, filename);

    const headers = this.getOutputHeaders();
    const configs = this.getColumnConfigs();

    // Convert data to TSV format using column configs
    const tsvContent = [
      headers.join('\t'),
      ...data.map((status) => {
        const values = this.getStatusValues(status);
        return configs
          .map((col, i) => {
            let value = values[i];

            // Apply number formatting for TSV (use original precision for TSV)
            if (col.type === 'number' && typeof value === 'number') {
              // Use specific precision for TSV export
              if (
                col.name.includes('return') ||
                col.name.includes('fees') ||
                col.name.includes('drawdown') ||
                col.name.includes('gain') ||
                col.name.includes('loss')
              ) {
                value = value.toFixed(6);
              } else {
                value = value.toFixed(2);
              }
            }

            return value.toString();
          })
          .join('\t');
      }),
    ].join('\n');

    // Write to file
    fs.writeFileSync(fullPath, tsvContent, 'utf8');
    logger.log(
      `Unified output exported: ${path.relative(process.cwd(), fullPath)}`,
    );
  }
}
