#!/usr/bin/env node
/**
 * Wranngle Unified Presales Pipeline CLI
 *
 * Generates all 3 presales documents from a single input:
 * - Project Plan
 * - Proposal
 * - AI Process Report
 *
 * Usage:
 *   node cli.ts generate <input.txt> <output_dir/>
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import dotenv from 'dotenv';

// Load environment variables from script directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

function replacePathExtension(filePath, extension) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}${extension}`);
}

function replaceHtmlPathExtension(filePath, extension) {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.html')) {
    return `${filePath.slice(0, -5)}${extension}`;
  }

  if (lowerPath.endsWith('.htm')) {
    return `${filePath.slice(0, -4)}${extension}`;
  }

  return `${filePath}${extension}`;
}

/**
 * Check if the history server is running
 */
function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/history`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the history server in background
 * Uses tsx for ESM/TypeScript support
 */
function startServer() {
  const serverPath = path.join(__dirname, 'server.ts');
  const isWindows = process.platform === 'win32';
  
  let child;
  if (isWindows) {
    // On Windows, use cmd /c start /b to launch in background more reliably
    // This ensures it survives the parent process exiting.
    child = spawn('cmd.exe', ['/c', 'start', '/b', 'npx.cmd', 'tsx', serverPath], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
      windowsHide: true
    });
  } else {
    child = spawn('npx', ['tsx', serverPath], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    });
  }
  
  child.unref();
  return child.pid;
}

/**
 * Open URL in default browser (Not used automatically)
 */
function _openBrowser(url) {
  // Function preserved but not called automatically per user preference
  const {platform} = process;
  let cmd;

  if (platform === 'win32') {
    cmd = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
  } else if (platform === 'darwin') {
    cmd = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    cmd = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }

  cmd.unref();
}

/**
 * Ensure server is running (does NOT auto-open browser)
 */
async function ensureServerRunning() {
  const running = await isServerRunning();

  if (!running) {
    console.log('\u001B[34mℹ\u001B[0m Starting history server in background...');
    startServer();
    // Wait for server to initialize
    let attempts = 0;
    while (attempts < 5) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await isServerRunning()) break;
      attempts++;
    }
  }

  console.log(`\u001B[34mℹ\u001B[0m Dashboard: ${SERVER_URL} (Browser will not open automatically)`);
}

const USAGE = `
╔═══════════════════════════════════════════════════════════════╗
║          WRANNGLE UNIFIED PRESALES PIPELINE                   ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  wranngle <command> [options]

Commands:
  generate <input>    Generate presales documents from input file
  render:html <json>  Render an existing pipeline schema/context to HTML
  eval:<subcommand>   Evaluation framework commands

Generation:
  Generates all 3 presales documents from a single input file:
  1. AI Process Report - Traffic light diagnostic report
  2. Project Plan      - Technical project plan with estimates
  3. Proposal          - 2-page client-facing proposal with pricing

  Output: ./output/{client-slug}/

Generate Arguments:
  <input>        Path to input file (unstructured text or structured JSON)

Generate Options:
  --structured   Force treat input as structured JSON questionnaire data
                 (bypasses LLM extraction for faster processing)

Render HTML Options:
  --template <path>  HTML/Mustache template path (default: templates/presales_report.html)
  --output <path>    Output HTML path (default: beside input as .html)
  --pdf              Also render a PDF from the generated HTML

Evaluation Commands:
  eval:stats     Show corpus and evaluation statistics
  eval:list      List case studies in corpus
  eval:run       Run evaluation on a single case study
  eval:batch     Run batch evaluation on all case studies
  eval:harvest   Harvest a case study from URL content
  eval:report    Generate flaw analysis report
  eval:import    Import fixture files to corpus

Environment Variables:
  GEMINI_API_KEY     Required - Google Gemini API key (not needed for structured)
  GROQ_API_KEY       Optional - Groq API key (fallback)

Examples:
  wranngle generate input/acme-corp-rfp.txt
  wranngle generate input/healthcare_intake.json --structured
  wranngle render:html output/acme/schema.json --pdf
  wranngle eval:stats
  wranngle eval:batch --output report.json
`;

async function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];

  // Handle eval:* commands
  if (command.startsWith('eval:') || command === 'eval') {
    const { handleEvalCommand } = await import('./lib/evaluation/cli.js');

    const subcommand = command === 'eval' ? null : command.split(':')[1];
    const evalArgs = args.slice(1).filter((a) => !a.startsWith('--'));

    // Parse options
    const options = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--verbose' || args[i] === '-v') options.verbose = true;
      if (args[i] === '--dry-run') options.dryRun = true;
      if (args[i] === '--include-holdout') options.includeHoldout = true;
      if (args[i] === '--force') options.force = true;
      if (args[i] === '--save') options.save = true;
      if (args[i] === '--holdout') options.holdout = true;
      if (args[i] === '--url' && args[i + 1]) options.url = args[++i];
      if (args[i] === '--content' && args[i + 1]) options.content = args[++i];
      if (args[i] === '--title' && args[i + 1]) options.title = args[++i];
      if (args[i] === '--vendor' && args[i + 1]) options.vendor = args[++i];
      if (args[i] === '--output' && args[i + 1]) options.output = args[++i];
      if (args[i] === '--limit' && args[i + 1]) options.limit = Number.parseInt(args[++i], 10);
    }

    await handleEvalCommand(subcommand, evalArgs, options);
    process.exit(0);
  }

  if (command === 'render:html') {
    let inputPath = null;
    let outputPath = null;
    let templatePath = path.join(__dirname, 'templates', 'presales_report.html');
    let renderPdf = false;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--template' && args[i + 1]) {
        templatePath = args[++i];
      } else if (args[i] === '--output' && args[i + 1]) {
        outputPath = args[++i];
      } else if (args[i] === '--pdf') {
        renderPdf = true;
      } else {
        inputPath ||= args[i];
      }
    }

    if (!inputPath) {
      console.error('Error: render:html requires a pipeline schema/context JSON file');
      process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found: ${inputPath}`);
      process.exit(1);
    }

    const schema = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const defaultOutputPath = replacePathExtension(inputPath, '.html');
    const htmlPath = outputPath || defaultOutputPath;
    const { generatePresalesHtmlReport, writeHtmlReport } = await import('./lib/html-report-generator.js');
    const { html } = generatePresalesHtmlReport(schema, { templatePath });
    const written = writeHtmlReport(htmlPath, html);
    console.log(`HTML report saved: ${written.path} (${(written.size / 1024).toFixed(1)} KB)`);

    if (renderPdf) {
      const { generatePDF } = await import('./lib/pdf-generator.js');
      const pdfPath = replaceHtmlPathExtension(written.path, '.pdf');
      const pdf = await generatePDF(written.path, pdfPath);
      console.log(`PDF report saved: ${pdf.pdfPath} (${pdf.sizeDisplay}, ${pdf.pageCount} pages)`);
    }

    process.exit(0);
  }

  if (command !== 'generate') {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  // Parse arguments and options
  let inputPath = null;
  let forceStructured = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--structured') {
      forceStructured = true;
    } else inputPath ||= args[i];
  }

  const outputDir = path.join(__dirname, 'output');

  // Validate input
  if (!inputPath) {
    console.error('Error: Input file is required');
    console.log(USAGE);
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Auto-detect structured input
  const isJsonFile = inputPath.endsWith('.json');
  const isStructured = forceStructured || isJsonFile;

  // Check API key (not required for structured input)
  if (!isStructured && !process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  // Validate structured input is valid JSON
  if (forceStructured) {
    try {
      const content = fs.readFileSync(inputPath, 'utf8');
      JSON.parse(content);
    } catch (error) {
      console.error(`Error: --structured flag requires valid JSON input`);
      console.error(`Parse error: ${error.message}`);
      process.exit(1);
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Start server if not already running (no auto-open browser)
  await ensureServerRunning();

  // Read input file
  const inputText = fs.readFileSync(inputPath, 'utf8');
  
  // Connect to SSE stream first to receive logs
  const EventSourceModule = await import('eventsource');
  const EventSource = EventSourceModule.default || EventSourceModule.EventSource || EventSourceModule;
  const es = new EventSource(`${SERVER_URL}/api/stream`);
  
  // ANSI color helpers
  const ansi = {
    reset: '\u001B[0m',
    dim: '\u001B[2m',
  };
  
  let pipelineComplete = false;
  let pipelineSuccess = true;
  
  es.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.msg) {
        // Print log message (already has ANSI colors from pipeline)
        console.log(data.msg);

        // Check for completion (detect multiple success patterns)
        if (data.msg.includes('COMPLETED SUCCESSFULLY') || data.msg.includes('PIPELINE COMPLETE')) {
          pipelineComplete = true;
          pipelineSuccess = true;
        } else if (data.msg.includes('FATAL ERROR') || data.msg.includes('Pipeline failed')) {
          pipelineComplete = true;
          pipelineSuccess = false;
        }
      }
    } catch {
      // Ignore parse errors
    }
  });

  es.addEventListener('error', () => {
    if (!pipelineComplete) {
      console.error(`${ansi.dim}SSE connection error - continuing...${ansi.reset}`);
    }
  });
  
  // Submit to server API (this will trigger the SSE events)
  try {
    const response = await fetch(`${SERVER_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: inputText,
        structured: isStructured
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`API error: ${error.error || response.statusText}`);
      es.close();
      process.exit(1);
    }
    
    // Wait for pipeline completion (check every 500ms, max 10 minutes)
    const maxWait = 10 * 60 * 1000;
    const startTime = Date.now();
    
    // eslint-disable-next-line no-unmodified-loop-condition -- pipelineComplete is mutated asynchronously by SSE handler
    while (!pipelineComplete && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    es.close();
    
    if (!pipelineComplete) {
      console.error('Pipeline timed out after 10 minutes');
      process.exit(1);
    }
    
    process.exit(pipelineSuccess ? 0 : 1);
    
  } catch (error) {
    es.close();
    console.error(`Failed to connect to server: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
