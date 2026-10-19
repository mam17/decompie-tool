import fs from 'node:fs';
import path from 'node:path';
import { computeFileHash, formatBytes, ensureDirSync, info, warn, success } from './utils.js';

export class JsAnalyzer {
  constructor(reaBridge) {
    this.rea = reaBridge;
  }

  async analyze(targetPath, options = {}) {
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Target JavaScript/Electron path does not exist: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    info(`Analyzing JS/Electron target: ${path.basename(resolvedPath)} (${stats.isDirectory() ? 'Directory' : formatBytes(stats.size)})`);

    const result = {
      target: {
        path: resolvedPath,
        fileName: path.basename(resolvedPath),
        isDirectory: stats.isDirectory(),
        sizeFormatted: stats.isDirectory() ? 'N/A' : formatBytes(stats.size),
        sha256: stats.isDirectory() ? null : await computeFileHash(resolvedPath)
      },
      astAnalysis: null,
      recoveredSources: null,
      findings: []
    };

    info('Running REA analyze-javascript-application...');
    const analyzeRes = await this.rea.analyzeJavascriptApplication(resolvedPath);
    if (analyzeRes.success && analyzeRes.data) {
      result.astAnalysis = analyzeRes.data;
      success('JavaScript application analyzed.');
    } else {
      warn(`REA JS analysis note: ${analyzeRes.error || 'No AST data'}`);
    }

    if (options.outputDir && options.recoverSources) {
      const srcDir = path.join(options.outputDir, 'recovered_src');
      ensureDirSync(srcDir);
      info(`Recovering readable JavaScript modules to ${srcDir}...`);
      const recoverRes = await this.rea.recoverJavascriptSources(resolvedPath, srcDir);
      if (recoverRes.success) {
        result.recoveredSources = srcDir;
        success('Sources recovered.');
      } else {
        warn(`Source recovery: ${recoverRes.error || 'Skipped'}`);
      }
    }

    return result;
  }
}
