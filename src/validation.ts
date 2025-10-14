/**
 * Data validation and typo detection utilities
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Validation error interface
 */
export interface ValidationError {
  row: number;
  field: string;
  value: string;
  validOptions: string[];
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for finding similar strings (typo suggestions)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Find closest matches using Levenshtein distance
 * @param value - The value to match
 * @param options - Array of valid options
 * @param maxSuggestions - Maximum number of suggestions to return
 * @returns Array of closest matches
 */
export function findClosestMatches(value: string, options: string[], maxSuggestions: number = 3): string[] {
  const valueLower = value.toLowerCase();
  
  // Calculate distance for each option
  const distances = options.map(option => ({
    option,
    distance: levenshteinDistance(valueLower, option.toLowerCase())
  }));
  
  // Sort by distance
  distances.sort((a, b) => a.distance - b.distance);
  
  // Return top matches that are reasonably close (distance <= 3)
  return distances
    .filter(d => d.distance <= 3)
    .slice(0, maxSuggestions)
    .map(d => d.option);
}

/**
 * Load field options from available_options.json (dynamically built) or field_options.json (static)
 * @returns Object mapping field names to allowed values
 */
export function loadFieldOptions(): Record<string, string[]> {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not load available_options.json. Validation disabled.`);
      return {};
    }
  }
  
  console.warn(`⚠️  Warning: available_options.json not found. Validation disabled.`);
  return {};
}

/**
 * Initialize available_options.json with empty object
 */
export function initializeAvailableOptions(): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  fs.writeFileSync(availableOptionsPath, JSON.stringify({}, null, 2), 'utf-8');
}

/**
 * Update available_options.json with learned field values
 * @param fieldName - Name of the field (e.g., 'taskProduct', 'task')
 * @param values - Array of unique values to add
 */
export function updateAvailableOptions(fieldName: string, values: string[]): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  let currentOptions: Record<string, string[]> = {};
  
  // Load current options
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      currentOptions = JSON.parse(content);
    } catch (error) {
      // Start fresh if file is corrupted
      currentOptions = {};
    }
  }
  
  // Update with new values (sorted and unique)
  const existingValues = currentOptions[fieldName] || [];
  const combinedValues = [...new Set([...existingValues, ...values])];
  currentOptions[fieldName] = combinedValues.sort();
  
  // Write back
  fs.writeFileSync(availableOptionsPath, JSON.stringify(currentOptions, null, 2), 'utf-8');
}

/**
 * Extract unique values from data for a specific field
 * @param rows - Array of data rows
 * @param fieldName - Name of the field to extract
 * @returns Array of unique values
 */
export function extractUniqueValues(rows: any[], fieldName: string): string[] {
  const values = new Set<string>();
  
  rows.forEach(row => {
    const fieldValue = row[fieldName];
    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
      if (Array.isArray(fieldValue)) {
        fieldValue.forEach(v => {
          const trimmed = String(v).trim();
          if (trimmed) values.add(trimmed);
        });
      } else {
        const trimmed = String(fieldValue).trim();
        if (trimmed) values.add(trimmed);
      }
    }
  });
  
  return Array.from(values).sort();
}

/**
 * Validate Task:Responsibility specification
 */
function validateTaskResponsibilitySpec(
  specValue: string,
  part1: string,
  part2: string,
  specField: string,
  rowIndex: number,
  fieldOptions: Record<string, any>,
  errors: ValidationError[]
): void {
  // Validate task exists
  const tasks = fieldOptions['task'];
  if (tasks && tasks.length > 0 && !tasks.includes(part1)) {
    errors.push({
      row: rowIndex + 2,
      field: specField + ' (Task part)',
      value: part1,
      validOptions: tasks
    });
  }
  
  // Validate responsibility exists for this task
  const taskResponsibilities = fieldOptions['task_responsibilities'];
  if (taskResponsibilities && taskResponsibilities[part1]) {
    const validResponsibilities = taskResponsibilities[part1];
    if (!validResponsibilities.includes(part2)) {
      errors.push({
        row: rowIndex + 2,
        field: specField + ' (Responsibility part)',
        value: part2,
        validOptions: validResponsibilities
      });
    }
  }
}

/**
 * Validate taskProduct:task specification
 */
function validateTaskProductTaskSpec(
  specValue: string,
  part1: string,
  part2: string,
  specField: string,
  rowIndex: number,
  fieldOptions: Record<string, any>,
  errors: ValidationError[]
): void {
  // Validate taskProduct exists
  const taskProducts = fieldOptions['taskProduct'];
  if (taskProducts && taskProducts.length > 0 && !taskProducts.includes(part1)) {
    errors.push({
      row: rowIndex + 2,
      field: specField + ' (taskProduct part)',
      value: part1,
      validOptions: taskProducts
    });
  }
  
  // Validate task can produce this taskProduct
  const taskProductProducers = fieldOptions['taskProduct_producers'];
  if (taskProductProducers && taskProductProducers[part1]) {
    const validTasks = taskProductProducers[part1];
    if (!validTasks.includes(part2)) {
      errors.push({
        row: rowIndex + 2,
        field: specField + ' (task part)',
        value: part2,
        validOptions: validTasks
      });
    }
  }
}

/**
 * Validate enhancement:taskProduct specification
 */
function validateEnhancementTaskProductSpec(
  specValue: string,
  part1: string,
  part2: string,
  specField: string,
  rowIndex: number,
  fieldOptions: Record<string, any>,
  errors: ValidationError[]
): void {
  // Validate enhancement exists
  const enhancements = fieldOptions['enhancement'];
  if (enhancements && enhancements.length > 0 && !enhancements.includes(part1)) {
    errors.push({
      row: rowIndex + 2,
      field: specField + ' (enhancement part)',
      value: part1,
      validOptions: enhancements
    });
  }
  
  // Validate taskProduct exists
  const taskProducts = fieldOptions['taskProduct'];
  if (taskProducts && taskProducts.length > 0 && !taskProducts.includes(part2)) {
    errors.push({
      row: rowIndex + 2,
      field: specField + ' (taskProduct part)',
      value: part2,
      validOptions: taskProducts
    });
  }
  
  // Validate enhancement is valid for this taskProduct
  const taskProductEnhancements = fieldOptions['taskProduct_enhancements'];
  if (taskProductEnhancements && taskProductEnhancements[part2]) {
    const validEnhancements = taskProductEnhancements[part2];
    if (validEnhancements.length > 0 && !validEnhancements.includes(part1)) {
      errors.push({
        row: rowIndex + 2,
        field: specField + ' (enhancement compatibility)',
        value: specValue,
        validOptions: validEnhancements.map((e: string) => `${e}: ${part2}`)
      });
    }
  }
  
  // Validate there exists a task that adds this enhancement 
  // and has this taskProduct as both input and output
  const tasksData = fieldOptions['_tasksData'];
  if (tasksData && Array.isArray(tasksData)) {
    const matchingTask = tasksData.find((task: any) => {
      // Check if task has the enhancement
      if (task.enhancement !== part1) return false;
      
      // Check if taskProduct is in inputs
      const inputs = Array.isArray(task.inputs) ? task.inputs : [];
      if (!inputs.includes(part2)) return false;
      
      // Check if taskProduct is in outputs
      const outputs = Array.isArray(task.outputs) ? task.outputs : [];
      if (!outputs.includes(part2)) return false;
      
      return true;
    });
    
    if (!matchingTask) {
      // Find which tasks have this enhancement to suggest
      const tasksWithEnhancement = tasksData
        .filter((task: any) => task.enhancement === part1)
        .map((task: any) => task.task);
      
      errors.push({
        row: rowIndex + 2,
        field: specField + ' (task existence)',
        value: `No task adds "${part1}" enhancement to "${part2}"`,
        validOptions: tasksWithEnhancement.length > 0 
          ? [`Tasks with ${part1}: ${tasksWithEnhancement.join(', ')}`]
          : ['No tasks found with this enhancement']
      });
    }
  }
}

/**
 * Validate simple fields (non-compound fields)
 */
function validateSimpleFields(
  rows: any[],
  fieldOptions: Record<string, any>,
  errors: ValidationError[]
): void {
  // Fields that should be validated
  const fieldsToValidate = ['inputs', 'outputs', 'enhancement', 'enhancement-order', 'responsibility_options', 'task', 'taskProduct'];
  
  // Map fields to their validation source (inputs/outputs should validate against taskProduct)
  const fieldValidationMap: Record<string, string> = {
    'inputs': 'taskProduct',
    'outputs': 'taskProduct',
    'enhancement': 'enhancement',
    'enhancement-order': 'enhancement',
    'responsibility_options': 'responsibility_options',
    'task': 'task',
    'taskProduct': 'taskProduct'
  };
  
  rows.forEach((row, rowIndex) => {
    for (const field of fieldsToValidate) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        const validationKey = fieldValidationMap[field] || field;
        const fieldKey = validationKey.replace(/-/g, '_'); // Handle field name variations
        const allowedOptions = fieldOptions[validationKey] || fieldOptions[fieldKey];
        
        if (allowedOptions && allowedOptions.length > 0) {
          const values = Array.isArray(row[field]) ? row[field] : [row[field]];
          
          for (const value of values) {
            const trimmedValue = String(value).trim();
            if (trimmedValue && !allowedOptions.includes(trimmedValue)) {
              errors.push({
                row: rowIndex + 2, // +2 because: +1 for 0-index, +1 for header row
                field: field,
                value: trimmedValue,
                validOptions: allowedOptions
              });
            }
          }
        }
      }
    }
  });
}

/**
 * Validate specification fields (compound fields with ":" separator)
 */
function validateSpecificationFields(
  rows: any[],
  fieldOptions: Record<string, any>,
  errors: ValidationError[]
): void {
  const specificationFields = [
    'responsibility specification (Task:Responsibility)',
    'transformation specification (taskProduct:task)',
    'enhancement medium specification (enhancement:taskProduct)'
  ];
  
  rows.forEach((row, rowIndex) => {
    for (const specField of specificationFields) {
      if (row[specField] !== undefined && row[specField] !== null && row[specField] !== '') {
        const specValue = String(row[specField]).trim();
        if (!specValue) continue;
        
        // Parse the specification (format: "value1: value2")
        const parts = specValue.split(':').map(p => p.trim());
        if (parts.length !== 2) continue;
        
        const [part1, part2] = parts;
        
        // Determine what to validate based on the field name and delegate to specific validator
        if (specField.includes('Task:Responsibility')) {
          validateTaskResponsibilitySpec(specValue, part1, part2, specField, rowIndex, fieldOptions, errors);
        } else if (specField.includes('taskProduct:task')) {
          validateTaskProductTaskSpec(specValue, part1, part2, specField, rowIndex, fieldOptions, errors);
        } else if (specField.includes('enhancement:taskProduct')) {
          validateEnhancementTaskProductSpec(specValue, part1, part2, specField, rowIndex, fieldOptions, errors);
        }
      }
    }
  });
}

/**
 * Validate data against field options
 * @param rows - Array of data rows to validate
 * @param fieldOptions - Object containing allowed values for each field
 * @returns Array of validation errors
 */
export function validateData(rows: any[], fieldOptions: Record<string, string[]>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Validate simple fields (single values or arrays)
  validateSimpleFields(rows, fieldOptions as any, errors);
  
  // Validate specification fields (compound "part1:part2" format)
  validateSpecificationFields(rows, fieldOptions as any, errors);
  
  return errors;
}

/**
 * Report validation errors to console in a formatted way
 * @param file - Filename being validated
 * @param errors - Array of validation errors
 * @param sourceType - Type of source ('JSON' or 'XLSX')
 */
export function reportValidationErrors(file: string, errors: ValidationError[], sourceType: 'JSON' | 'XLSX' = 'XLSX'): void {
  console.log(`❌ ${file} - VALIDATION FAILED - Typos detected!`);
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('  ║                         TYPO DETECTION REPORT                         ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  errors.forEach((error, idx) => {
    console.log(`  Typo #${idx + 1}:`);
    
    // Format location based on source type
    if (sourceType === 'JSON') {
      console.log(`  ├─ Location: Record ${error.row - 1} (JSON array index ${error.row - 2})`);
    } else {
      console.log(`  ├─ Location: Row ${error.row} (Excel row ${error.row})`);
    }
    
    console.log(`  ├─ Field: "${error.field}"`);
    console.log(`  ├─ Invalid value: "${error.value}"`);
    console.log(`  ├─ Valid options (${error.validOptions.length}):`);
    
    // Show valid options, grouped if many
    if (error.validOptions.length <= 10) {
      error.validOptions.forEach(opt => {
        console.log(`  │    • ${opt}`);
      });
    } else {
      error.validOptions.slice(0, 5).forEach(opt => {
        console.log(`  │    • ${opt}`);
      });
      console.log(`  │    ... and ${error.validOptions.length - 5} more options`);
    }
    
    // Suggest close matches
    const suggestions = findClosestMatches(error.value, error.validOptions, 3);
    if (suggestions.length > 0) {
      console.log(`  └─ Did you mean:`);
      suggestions.forEach(sugg => {
        console.log(`       → "${sugg}"`);
      });
    } else {
      console.log(`  └─ No close matches found`);
    }
    console.log('');
  });
  
  console.log(`  Total typos found: ${errors.length}`);
  console.log(`  ⚠️  File transformation aborted due to validation errors.`);
  console.log('');
}

/**
 * Build relationship: for each task, what responsibilities are available
 */
export function buildTaskResponsibilities(tasksData: any[]): Record<string, string[]> {
  const taskResponsibilities: Record<string, string[]> = {};
  
  tasksData.forEach(taskRow => {
    const task = taskRow.task;
    const responsibilities = taskRow.responsibility_options;
    
    if (task && responsibilities) {
      const responsibilityArray = Array.isArray(responsibilities) ? responsibilities : [responsibilities];
      taskResponsibilities[task] = responsibilityArray.filter((r: string) => r && r.trim() !== '');
    }
  });
  
  return taskResponsibilities;
}

/**
 * Build relationship: for each taskProduct, which tasks can produce it (have it as output)
 */
export function buildTaskProductProducers(tasksData: any[]): Record<string, string[]> {
  const taskProductProducers: Record<string, string[]> = {};
  
  tasksData.forEach(taskRow => {
    const task = taskRow.task;
    const outputs = taskRow.outputs;
    
    if (task && outputs) {
      const outputArray = Array.isArray(outputs) ? outputs : [outputs];
      outputArray.forEach((output: string) => {
        if (output && output.trim() !== '') {
          if (!taskProductProducers[output]) {
            taskProductProducers[output] = [];
          }
          if (!taskProductProducers[output].includes(task)) {
            taskProductProducers[output].push(task);
          }
        }
      });
    }
  });
  
  return taskProductProducers;
}

/**
 * Build relationship: for each taskProduct, what enhancements are available
 */
export function buildTaskProductEnhancements(taskProductsData: any[]): Record<string, string[]> {
  const taskProductEnhancements: Record<string, string[]> = {};
  
  taskProductsData.forEach(row => {
    const taskProduct = row.taskProduct;
    const enhancementOrder = row['enhancement-order'];
    
    if (taskProduct) {
      const enhancements = Array.isArray(enhancementOrder) ? enhancementOrder : [];
      taskProductEnhancements[taskProduct] = enhancements.filter((e: string) => e && e.trim() !== '');
    }
  });
  
  return taskProductEnhancements;
}

/**
 * Update available_options.json with relationship mappings
 */
export function updateAvailableOptionsRelationships(
  taskResponsibilities: Record<string, string[]>,
  taskProductProducers: Record<string, string[]>,
  taskProductEnhancements: Record<string, string[]>
): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  let currentOptions: Record<string, any> = {};
  
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      currentOptions = JSON.parse(content);
    } catch (error) {
      currentOptions = {};
    }
  }
  
  // Add the relationship mappings
  currentOptions['task_responsibilities'] = taskResponsibilities;
  currentOptions['taskProduct_producers'] = taskProductProducers;
  currentOptions['taskProduct_enhancements'] = taskProductEnhancements;
  
  fs.writeFileSync(availableOptionsPath, JSON.stringify(currentOptions, null, 2), 'utf-8');
}

/**
 * Build service specifications mapping from services data
 * @param servicesData - Array of service records
 * @returns Record mapping each service name to its full specification
 */
export function buildServiceSpecifications(servicesData: any[]): Record<string, any> {
  const serviceSpecs: Record<string, any> = {};
  
  servicesData.forEach((service: any) => {
    const serviceName = service.Service;
    if (serviceName) {
      serviceSpecs[serviceName] = {
        taskProduct: service.taskProduct || null,
        enhancement: service.enhancement || null,
        'responsibility specification (Task:Responsibility)': service['responsibility specification (Task:Responsibility)'] || null,
        'transformation specification (taskProduct:task)': service['transformation specification (taskProduct:task)'] || null,
        'enhancement medium specification (enhancement:taskProduct)': service['enhancement medium specification (enhancement:taskProduct)'] || null
      };
    }
  });
  
  return serviceSpecs;
}

/**
 * Update available_options.json with service specifications
 * @param serviceSpecifications - Service specifications mapping
 */
export function updateAvailableOptionsServiceSpecs(serviceSpecifications: Record<string, any>): void {
  const availableOptionsPath = path.join(__dirname, '../available_options.json');
  let currentOptions: Record<string, any> = {};
  
  if (fs.existsSync(availableOptionsPath)) {
    try {
      const content = fs.readFileSync(availableOptionsPath, 'utf-8');
      currentOptions = JSON.parse(content);
    } catch (error) {
      currentOptions = {};
    }
  }
  
  // Add the service specifications
  currentOptions['service_specifications'] = serviceSpecifications;
  
  fs.writeFileSync(availableOptionsPath, JSON.stringify(currentOptions, null, 2), 'utf-8');
}

