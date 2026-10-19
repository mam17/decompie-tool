import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { info, warn, error } from './utils.js';

const execAsync = promisify(exec);

export class ReaBridge {
  constructor(options = {}) {
    this.reaVersion = options.reaVersion || '6.7.0';
    this.cliPrefix = options.cliPrefix || (process.platform === 'win32'
      ? `cmd.exe /d /c npx -y rea-agents@${this.reaVersion}`
      : `npx -y rea-agents@${this.reaVersion}`);
  }

  async runCommand(subcommand, args = [], options = {}) {
    const serializedArgs = args.map(arg => {
      if (typeof arg === 'string' && (arg.includes(' ') || arg.includes('"'))) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return String(arg);
    }).join(' ');

    const fullCommand = `${this.cliPrefix} ${subcommand} ${serializedArgs}`.trim();

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: options.timeout || 120000,
        ...options
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (err) {
      return {
        success: false,
        exitCode: err.code,
        stdout: (err.stdout || '').trim(),
        stderr: (err.stderr || err.message || '').trim()
      };
    }
  }

  async runJsonCommand(subcommand, args = [], options = {}) {
    const finalArgs = [...args, '--format', 'json'];
    const res = await this.runCommand(subcommand, finalArgs, options);

    if (!res.success && !res.stdout) {
      return {
        success: false,
        error: res.stderr || 'Command failed with no output',
        exitCode: res.exitCode,
        data: null
      };
    }

    try {
      const parsed = JSON.parse(res.stdout);
      return {
        success: res.success || Boolean(parsed),
        error: res.success ? null : res.stderr,
        data: parsed
      };
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse JSON output: ${e.message}`,
        raw: res.stdout,
        stderr: res.stderr,
        data: null
      };
    }
  }

  async doctor() {
    return this.runJsonCommand('doctor', ['--client', 'antigravity']);
  }

  async inspectAndroidPackage(apkPath) {
    const resolvedPath = path.resolve(apkPath);
    return this.runJsonCommand('inspect-android-package', [resolvedPath]);
  }

  async searchAndroidClasses(apkPath, query = '') {
    const resolvedPath = path.resolve(apkPath);
    const args = [resolvedPath];
    if (query) args.push(query);
    return this.runJsonCommand('search-android-classes', args);
  }

  async decodeAndroidResources(apkPath, outputDir = null) {
    const resolvedPath = path.resolve(apkPath);
    const args = [resolvedPath];
    if (outputDir) {
      args.push('--output-directory', path.resolve(outputDir));
    }
    return this.runJsonCommand('decode-android-resources', args);
  }

  async projectAndroidApplicationGraph(apkPath) {
    const resolvedPath = path.resolve(apkPath);
    return this.runJsonCommand('project-android-application-graph', [resolvedPath]);
  }

  async analyzeJavascriptApplication(appPath) {
    const resolvedPath = path.resolve(appPath);
    return this.runJsonCommand('analyze-javascript-application', [resolvedPath]);
  }

  async recoverJavascriptSources(appPath, outputDir) {
    const resolvedPath = path.resolve(appPath);
    const resolvedOut = path.resolve(outputDir);
    return this.runJsonCommand('recover-javascript-sources', [resolvedPath, '--output-directory', resolvedOut]);
  }

  async inspectPeResources(pePath) {
    const resolvedPath = path.resolve(pePath);
    return this.runJsonCommand('inspect-pe-resources', [resolvedPath]);
  }

  async listAdbDevices() {
    return this.runJsonCommand('list-adb-devices');
  }

  async listAdbPackages(options = {}) {
    const args = [];
    if (options.serial) args.push('--serial', options.serial);
    return this.runJsonCommand('list-adb-packages', args);
  }

  async pullAdbPackage(packageName, outputDir, options = {}) {
    const args = [packageName, path.resolve(outputDir)];
    if (options.serial) args.push('--serial', options.serial);
    return this.runJsonCommand('pull-adb-package', args);
  }
}
