// src/config.js — Central configuration for DeepSeek Agent
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─────────────────────────────────────────────
//  Default configuration
// ─────────────────────────────────────────────
const defaults = {
  // Browser
  DEEPSEEK_URL   : 'https://chat.deepseek.com',
  HEADLESS       : false,

  // Model selection
  USE_DEEP_THINK : false,

  // Timing
  RESPONSE_TIMEOUT : 180_000,
  STABLE_DELAY     : 2_500,
  SEND_DELAY       : 400,

  // Agent
  MAX_ITERATIONS   : 40,
  WORKING_DIR      : process.cwd(),

  // Output
  MAX_OUTPUT_LENGTH : 8_000,
  DEBUG             : false,
};

// ─────────────────────────────────────────────
//  Config loading priority
// ─────────────────────────────────────────────
function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    console.warn('[deepseek-agent] Could not parse config file: ' + filePath);
  }
  return {};
}

const globalConfigPath  = path.join(os.homedir(), '.deepseek-agent', 'config.json');
const projectConfigPath = path.join(process.cwd(), 'deepseek-agent.config.json');

const config = {
  ...defaults,
  ...loadJson(globalConfigPath),
  ...loadJson(projectConfigPath),
};

delete config._comment;

// ─────────────────────────────────────────────
//  Per‑project session directory
// ─────────────────────────────────────────────
const projectName = path.basename(process.cwd()) || 'default';
config.SESSION_DIR = path.join(
  os.homedir(),
  '.deepseek-agent',
  'sessions',
  projectName
);

// ─────────────────────────────────────────────
//  Enforce Deep Think (R1)
// ─────────────────────────────────────────────
if (config.USE_DEEP_THINK === true) {
  try {
    const url = new URL(config.DEEPSEEK_URL);
    url.searchParams.set('model', 'deepseek-r1');
    config.DEEPSEEK_URL = url.toString();
    console.log('🧠 Deep Think (R1) mode enabled: ' + config.DEEPSEEK_URL);
  } catch (e) {
    if (!config.DEEPSEEK_URL.includes('?model=deepseek-r1')) {
      config.DEEPSEEK_URL += (config.DEEPSEEK_URL.includes('?') ? '&' : '?') + 'model=deepseek-r1';
    }
  }
}

// Resolve session dir to absolute path
if (!path.isAbsolute(config.SESSION_DIR)) {
  config.SESSION_DIR = path.resolve(process.cwd(), config.SESSION_DIR);
}

// Ensure directories exist
fs.mkdirSync(config.SESSION_DIR, { recursive: true });
fs.mkdirSync(path.join(os.homedir(), '.deepseek-agent', 'logs'), { recursive: true });

module.exports = config;