/**
 * Type definitions for the transform application
 */

/**
 * Summary of transformation operation
 */
export interface TransformSummary {
  successCount: number;
  errorCount: number;
  outputDir: string;
}

/**
 * Options for Excel worksheet creation
 */
export interface ExcelWriteOptions {
  sheetName: string;
  columnWidth?: number;
  boldHeaders?: boolean;
}

