import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m'
};

export function log(msg, color = Colors.reset) {
  console.log(`${color}${msg}${Colors.reset}`);
}

export function info(msg) {
  console.log(`${Colors.cyan}[INFO]${Colors.reset} ${msg}`);
}

export function success(msg) {
  console.log(`${Colors.green}[SUCCESS]${Colors.reset} ${msg}`);
}

export function warn(msg) {
  console.log(`${Colors.yellow}[WARN]${Colors.reset} ${msg}`);
}

export function error(msg) {
  console.error(`${Colors.red}[ERROR]${Colors.reset} ${msg}`);
}

export function header(title) {
  const line = '═'.repeat(60);
  console.log(`\n${Colors.bright}${Colors.cyan}${line}`);
  console.log(`  ${title}`);
  console.log(`${line}${Colors.reset}\n`);
}

export async function computeFileHash(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
