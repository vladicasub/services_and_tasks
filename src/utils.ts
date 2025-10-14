/**
 * Utility functions for file operations and Excel handling
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { unflattenObject } from './transforms';

/**
 * Validate that a directory exists and is actually a directory
 * @param dirPath - Path to validate
 * @returns Resolved absolute path
 * @throws Exits process if validation fails
 */
export function validateDirectory(dirPath: string): string {
  const resolvedPath = path.resolve(dirPath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Directory '${dirPath}' does not exist`);
    process.exit(1);
  }
  
  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    console.error(`Error: '${dirPath}' is not a directory`);
    process.exit(1);
  }
  
  return resolvedPath;
}

/**
 * Find all files with a specific extension in a directory (non-recursive)
 * @param dirPath - Directory to search
 * @param extension - File extension (e.g., '.json', '.xlsx')
 * @returns Array of filenames
 */
export function findFilesWithExtension(dirPath: string, extension: string): string[] {
  const allFiles = fs.readdirSync(dirPath);
  return allFiles.filter(file => {
    const filePath = path.join(dirPath, file);
    const fileStats = fs.statSync(filePath);
    return fileStats.isFile() && file.toLowerCase().endsWith(extension);
  });
}

/**
 * Helper function to extract plain text from Excel cell value
 * Handles richText objects that Excel creates for formatted cells
 * @param cellValue - The cell value from ExcelJS
 * @returns Plain text string
 */
export function extractCellText(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) {
    return '';
  }
  
  // Handle richText objects (formatted cells in Excel)
  if (typeof cellValue === 'object' && cellValue.richText && Array.isArray(cellValue.richText)) {
    return cellValue.richText.map((rt: any) => rt.text || '').join('');
  }
  
  // Handle regular values
  return String(cellValue);
}

/**
 * Read data from an Excel worksheet
 * @param worksheet - ExcelJS worksheet
 * @returns Object containing headers and data rows
 */
export function readExcelData(worksheet: ExcelJS.Worksheet): { headers: string[], rows: any[] } {
  const headers: string[] = [];
  const rows: any[] = [];
  
  // Get headers from first row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value);
  });
  
  const maxCol = headers.length;
  
  // Get data rows
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    
    const rowData: any = {};
    // Explicitly iterate over all column indices to catch empty cells
    for (let colIdx = 1; colIdx <= maxCol; colIdx++) {
      const header = headers[colIdx - 1];
      if (header) {
        const cell = row.getCell(colIdx);
        rowData[header] = extractCellText(cell.value);
      }
    }
    
    // Unflatten the object to restore arrays
    rows.push(unflattenObject(rowData));
  });
  
  return { headers, rows };
}

/**
 * Create an output directory if it doesn't exist
 * @param basePath - Base directory path
 * @returns Path to the outputs directory
 */
export function ensureOutputDirectory(basePath: string): string {
  const outputDir = path.join(basePath, 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

