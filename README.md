# Transform CLI Tool

A TypeScript-based CLI tool for bidirectional transformation between JSON and XLSX files with progressive learning and validation capabilities.

## Features

- ✨ **Bidirectional Transformation**: Convert JSON ↔ XLSX
- 🎓 **Progressive Learning**: Builds `available_options.json` from processed files
- ✅ **Validation**: Validates data against learned field options
- 🔗 **Relationship Mapping**: Builds task responsibilities, product producers, and enhancements
- 📋 **Service Specifications**: Generates comprehensive service specifications
- 🎯 **Step Mode**: Process files one at a time with keypress confirmation
- 🧪 **Unit Testing**: Full test coverage with Jest

## Installation

1. **Install dependencies:**
```bash
cd /home/vladica/work/src/services_and_tasks && npm install
```

2. **Build the project:**
```bash
cd /home/vladica/work/src/services_and_tasks && rm -rf dist && npm run build
```

## Usage

### Transform JSON to XLSX

Convert multiple JSON files to XLSX format:

```bash
cd /home/vladica/work/src/services_and_tasks && ./transform --input-json input_jsons/blueprint_task_products.json input_jsons/blueprint_tasks.json input_jsons/blueprint_services.json
```

**Output:**
- Creates XLSX files in `input_jsons/outputs/`
- Learns field options: `taskProduct`, `enhancement-order`, `enhancement`, `responsibility_options`, `task`, `Service`
- Builds relationship mappings (task → responsibilities, taskProduct → producers, etc.)
- Generates `available_options.json` with learned values

### Transform XLSX to JSON

Convert multiple XLSX files back to JSON format:

```bash
cd /home/vladica/work/src/services_and_tasks && ./transform --input-table input_tables/blueprint_task_products.xlsx input_tables/blueprint_tasks.xlsx input_tables/blueprint_services.xlsx
```

**Output:**
- Creates JSON files in `input_tables/outputs/`
- Validates against learned field options
- Builds relationships and service specifications
- Updates `available_options.json`

### Step Mode (Interactive Processing)

Process files one at a time with keypress confirmation after each file:

```bash
cd /home/vladica/work/src/services_and_tasks && ./transform --input-json input_jsons/blueprint_task_products.json input_jsons/blueprint_tasks.json input_jsons/blueprint_services.json --step
```

This mode is useful for:
- Debugging transformations
- Reviewing output after each file
- Understanding the progressive learning process

## Testing

Run the unit tests:

```bash
cd /home/vladica/work/src/services_and_tasks && npm test
```

## Progressive Learning

The tool learns from each file it processes:

1. **Phase 1: blueprint_task_products**
   - Learns: `taskProduct`, `enhancement-order`
   - No validation (learning phase)

2. **Phase 2: blueprint_tasks**
   - Learns: `enhancement`, `responsibility_options`, `task`
   - Validates against learned options
   - Builds relationship mappings:
     - Task → Responsibilities
     - TaskProduct → Producers  
     - TaskProduct → Enhancements

3. **Phase 3: blueprint_services**
   - Learns: `Service`
   - Validates against all learned options
   - Builds service specifications (44+ services)

All learned data is stored in `available_options.json` for future validations.

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main CLI application
│   ├── transforms.ts         # Data transformation functions
│   ├── validation.ts         # Validation and learning logic
│   ├── utils.ts              # Excel utilities and helpers
│   ├── types.ts              # TypeScript type definitions
│   └── roundtrip.test.ts     # Unit tests
├── dist/                     # Compiled JavaScript (generated)
├── input_jsons/              # Input JSON files
│   └── outputs/              # Generated XLSX files
├── input_tables/             # Input XLSX files
│   └── outputs/              # Generated JSON files
├── available_options.json    # Learned field options (generated)
├── transform                 # CLI wrapper script
├── package.json              # Node.js dependencies
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest test configuration
├── instructions.txt          # Build and run commands
└── README.md                 # This file
```

## Development Workflow

### Standard Development Iteration

```bash
# 1. Make code changes in src/

# 2. Build
cd /home/vladica/work/src/services_and_tasks && rm -rf dist && npm run build

# 3. Run
cd /home/vladica/work/src/services_and_tasks && ./transform --input-json input_jsons/blueprint_task_products.json input_jsons/blueprint_tasks.json input_jsons/blueprint_services.json

# 4. Test
cd /home/vladica/work/src/services_and_tasks && npm test
```

### Quick Development Mode

Use `ts-node` for faster iteration without building:

```bash
npm run dev -- --input-json input_jsons/blueprint_task_products.json input_jsons/blueprint_tasks.json input_jsons/blueprint_services.json
```

## Dependencies

### Runtime Dependencies
- **commander**: CLI framework for parsing arguments
- **exceljs**: Excel file reading and writing
- **xlsx**: Additional Excel format support

### Development Dependencies
- **typescript**: TypeScript compiler
- **jest**: Testing framework
- **ts-jest**: TypeScript support for Jest
- **ts-node**: TypeScript execution without compilation
- **@types/node**: Node.js type definitions
- **@types/jest**: Jest type definitions

## Output Files

### available_options.json

Contains learned field options and relationships:

```json
{
  "taskProduct": ["Hdr-images", "Panos", "spin_captures", ...],
  "enhancement-order": [["Photo-enhancement", "Blur", "Staging", "Declutter"]],
  "enhancement": ["Blur", "Photo-enhancement", "Declutter", ...],
  "task_responsibilities": { "Blurring": ["client", "IM_operators", "auto"], ... },
  "taskProduct_producers": { "Hdr-images": ["Blurring", "Photo enhancement", ...], ... },
  "service_specifications": { "Service Name": { ... }, ... }
}
```

### XLSX Files

Generated with:
- Bold headers
- Auto-sized columns (40 character width)
- Flattened nested JSON structures (dot notation)

### JSON Files

Generated with:
- Pretty printing (2-space indentation)
- Validated against learned field options
- Consistent structure

## Validation

The tool performs comprehensive validation:

1. **Field Value Validation**: Checks if values exist in learned options
2. **Reference Validation**: Validates cross-references between files
3. **Structure Validation**: Ensures required fields are present
4. **Type Validation**: Validates data types match expected schemas

Validation errors are reported with:
- File name
- Row number
- Field name
- Invalid value
- Suggestion of valid options

## Command Reference

See `instructions.txt` for the complete list of commands.

## License

ISC

## Version

1.0.0
