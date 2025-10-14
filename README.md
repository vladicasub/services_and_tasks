# Transform CLI Tool

A TypeScript-based CLI tool for processing and transforming JSON files.

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. (Optional) Install globally to use `transform` command anywhere:
```bash
npm run install-global
```

## Usage

### Option 1: Using the local shell script (Recommended)
```bash
cd /home/vladica/work/src/services_and_tasks && ./transform --input-json input_jsons
```

### Option 2: Using node directly
```bash
cd /home/vladica/work/src/services_and_tasks && node dist/index.js --input-json input_jsons
```

### Option 3: Add to PATH (for global usage)
Add this line to your `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="$PATH:/home/vladica/work/src/services_and_tasks"
```

Then reload your shell and use:
```bash
transform --input-json input_jsons
```

### Option 4: Using npm scripts (during development)
```bash
npm run dev -- --input-json input_jsons
```

### Short form
You can also use the short form `-i` instead of `--input-json`:
```bash
./transform -i input_jsons
```

## Development

- **Build**: `npm run build`
- **Dev mode**: `npm run dev -- [arguments]`
- **Install globally**: `npm run install-global`

## Project Structure

```
.
├── src/
│   └── index.ts          # Main CLI application
├── dist/                 # Compiled JavaScript (generated)
├── input_jsons/          # Input JSON files
├── package.json
├── tsconfig.json
└── README.md
```

