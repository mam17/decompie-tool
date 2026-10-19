import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ensureDirSync, info, warn, success, error } from './utils.js';

export class JadxClient {
  constructor(options = {}) {
    this.jarPath = options.jarPath || path.resolve('./tools/jadx-headless-mcp-0.7.1-all.jar');
    this.javaPath = options.javaPath || this.findJava();
    this.proc = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  findJava() {
    const candidates = [
      'C:\\Users\\AndroidDev\\AppData\\Local\\Programs\\Android Studio\\jbr\\bin\\java.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Android Studio', 'jbr', 'bin', 'java.exe')
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    return 'java';
  }

  async start() {
    if (!fs.existsSync(this.jarPath)) {
      throw new Error(`JADX MCP JAR not found at ${this.jarPath}`);
    }

    info(`Starting JADX MCP server via ${this.javaPath}...`);
    this.proc = spawn(this.javaPath, ['-jar', this.jarPath, '--max-source-bytes', '5000000'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr.on('data', chunk => {
      // Optional logging for debugging JADX progress
    });

    this.proc.on('close', code => {
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error(`JADX process terminated with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    // Initialize MCP session
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tool_revert', version: '1.0.0' }
    });

    success('JADX MCP server initialized.');
  }

  processBuffer() {
    let newlineIdx;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const { resolve, reject, timer } = this.pendingRequests.get(msg.id);
          this.pendingRequests.delete(msg.id);
          if (timer) clearTimeout(timer);

          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (_) {}
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;

      // 60s timeout for decompilation operations
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} (id=${id}) timed out after 60s`));
        }
      }, 60000);
      if (timer.unref) timer.unref();

      this.pendingRequests.set(id, { resolve, reject, timer });

      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      this.proc.stdin.write(payload);
    });
  }

  async callTool(name, args = {}) {
    const res = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });

    if (res.isError) {
      const errText = res.content?.map(c => c.text).join('\n') || 'Tool call error';
      throw new Error(errText);
    }

    return res;
  }

  async loadApk(apkPath) {
    const resolved = path.resolve(apkPath).replace(/\\/g, '/');
    info(`Loading APK into JADX: ${path.basename(resolved)}...`);
    const res = await this.callTool('load_apk', { path: resolved });
    success('APK loaded into JADX successfully.');
    return res;
  }

  async getMainApplicationClasses() {
    const res = await this.callTool('get_main_application_classes_names', {});
    const text = res.content?.[0]?.text;
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return parsed.classes || parsed.items || (Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      return [];
    }
  }

  async listAllClasses(prefix = '') {
    const args = { limit: 1000 };
    if (prefix) args.prefix = prefix;
    const res = await this.callTool('list_classes', args);
    const text = res.content?.[0]?.text;
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return parsed.items || parsed.classes || (Array.isArray(parsed) ? parsed : []);
    } catch (_) {
      return [];
    }
  }

  async getClassSource(className) {
    const res = await this.callTool('get_class_source', {
      class_name: className,
      smali_fallback: true
    });
    return res.content?.[0]?.text || '';
  }

  async decompilePackage(targetApk, outputDir, packagePrefix = '') {
    await this.loadApk(targetApk);
    let classes = await this.listAllClasses(packagePrefix);
    if (classes.length === 0) {
      classes = await this.getMainApplicationClasses();
    }

    const filtered = packagePrefix
      ? classes.filter(c => c.startsWith(packagePrefix))
      : classes;

    info(`Decompiling ${filtered.length} classes into ${outputDir}...`);
    ensureDirSync(outputDir);

    let count = 0;
    for (const cls of filtered) {
      try {
        const src = await this.getClassSource(cls);
        if (src) {
          const parts = cls.split('.');
          const fileName = parts.pop() + '.java';
          const relDir = parts.join(path.sep);
          const fullDir = path.join(outputDir, relDir);
          ensureDirSync(fullDir);

          fs.writeFileSync(path.join(fullDir, fileName), src, 'utf8');
          count++;
          if (count % 20 === 0 || count === filtered.length) {
            info(`Decompiled [${count}/${filtered.length}]: ${cls}`);
          }
        }
      } catch (err) {
        warn(`Failed to decompile ${cls}: ${err.message}`);
      }
    }

    success(`Decompilation completed! ${count} classes written to ${outputDir}`);
    return {
      total: filtered.length,
      decompiled: count,
      outputDir
    };
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch (_) {}
      this.proc = null;
    }
  }
}
