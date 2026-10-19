#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { ReaBridge } from '../src/rea_bridge.js';
import { AndroidAnalyzer } from '../src/android_analyzer.js';
import { JsAnalyzer } from '../src/js_analyzer.js';
import { Reporter } from '../src/reporter.js';
import { JadxClient } from '../src/jadx_client.js';
import { ProjectReconstructor } from '../src/project_reconstructor.js';
import {
  Colors,
  header,
  info,
  success,
  warn,
  error,
  log,
  formatBytes,
  ensureDirSync
} from '../src/utils.js';

function printHelp() {
  header('tool_revert - App Reverse Engineering Toolkit (Powered by REA)');
  console.log(`Usage:
  node bin/tool_revert.js <command> [options]

Commands:
  analyze <targetPath>      Auto-detect and reverse engineer target (APK, ASAR, directory, etc.)
  apk <apkPath>             Reverse engineer an Android APK (manifest, permissions, classes, SDKs)
  decompile <targetPath>    Decompile Java/Kotlin source code of app classes to disk via JADX
  reconstruct [targetPath]  Reconstruct complete buildable Android Studio project
  js <appPath>              Reverse engineer JavaScript / Electron applications
  adb <action>              ADB utilities: 'devices', 'packages', 'pull <pkg>'
  doctor                    Verify REA engine status and prerequisites
  help                      Show this help message

Options:
  --output, -o <dir>        Output directory for reports and decompiled assets (default: ./output)
  --decode-resources        Decode Android resources (APK) or recover sources (JS)
  --package, -p <prefix>    Filter decompile to specific package prefix (e.g. com.example)
  --help, -h                Show help

Examples:
  node bin/tool_revert.js analyze my_app.apk --decode-resources
  node bin/tool_revert.js decompile my_app.xapk -o ./output/source_code
  node bin/tool_revert.js decompile my_app.apk --package com.example.app
  node bin/tool_revert.js js ./electron_app
  node bin/tool_revert.js adb devices
  node bin/tool_revert.js doctor
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const rea = new ReaBridge();

  try {
    switch (command) {
      case 'doctor': {
        header('REA System Readiness Check (Doctor)');
        info('Running REA doctor diagnosis...');
        const res = await rea.doctor();
        if (res.data) {
          console.log(JSON.stringify(res.data, null, 2));
        } else {
          console.log(res.raw || res.error);
        }
        break;
      }

      case 'adb': {
        const subAction = args[1] || 'devices';
        header(`ADB Action: ${subAction}`);
        if (subAction === 'devices') {
          info('Listing attached ADB devices...');
          const res = await rea.listAdbDevices();
          console.log(JSON.stringify(res.data || res.error || res.raw, null, 2));
        } else if (subAction === 'packages') {
          info('Listing installed packages on device...');
          const res = await rea.listAdbPackages();
          console.log(JSON.stringify(res.data || res.error || res.raw, null, 2));
        } else if (subAction === 'pull') {
          const pkg = args[2];
          if (!pkg) {
            error('Missing package name. Usage: node bin/tool_revert.js adb pull <packageName>');
            process.exit(1);
          }
          const outDir = './output/adb_pulled';
          info(`Pulling APK for package ${pkg} to ${outDir}...`);
          const res = await rea.pullAdbPackage(pkg, outDir);
          console.log(JSON.stringify(res.data || res.error || res.raw, null, 2));
        } else {
          error(`Unknown ADB subaction: ${subAction}`);
        }
        break;
      }

      case 'decompile': {
        const targetPath = args[1];
        if (!targetPath) {
          error('Target APK / XAPK path required for decompile command.');
          printHelp();
          process.exit(1);
        }

        const resolvedTarget = path.resolve(targetPath);
        if (!fs.existsSync(resolvedTarget)) {
          error(`File does not exist: ${resolvedTarget}`);
          process.exit(1);
        }

        let apkToDecompile = resolvedTarget;
        const ext = path.extname(resolvedTarget).toLowerCase();

        if (ext === '.xapk' || ext === '.apkm') {
          const extractDir = path.resolve('./output/xapk_extracted', path.basename(resolvedTarget, ext));
          ensureDirSync(extractDir);
          info(`Extracting container ${path.basename(resolvedTarget)}...`);
          try {
            execSync(`tar -xf "${resolvedTarget}" -C "${extractDir}"`);
          } catch (e) {
            error(`Failed to extract XAPK: ${e.message}`);
            process.exit(1);
          }
          const apks = fs.readdirSync(extractDir, { recursive: true }).filter(f => f.endsWith('.apk'));
          let baseApk = apks.find(f => path.basename(f).toLowerCase() === 'base.apk') || apks[0];
          apkToDecompile = path.join(extractDir, baseApk);
        }

        let outDir = './output/decompiled_src';
        const outIdx = args.findIndex(a => a === '--output' || a === '-o');
        if (outIdx !== -1 && args[outIdx + 1]) {
          outDir = args[outIdx + 1];
        }

        let pkgPrefix = '';
        const pkgIdx = args.findIndex(a => a === '--package' || a === '-p');
        if (pkgIdx !== -1 && args[pkgIdx + 1]) {
          pkgPrefix = args[pkgIdx + 1];
        }

        header(`Decompiling Code: ${path.basename(apkToDecompile)}`);
        const jadx = new JadxClient();
        await jadx.start();

        try {
          // If no package prefix is given, auto-detect app package from manifest
          if (!pkgPrefix) {
            await jadx.loadApk(apkToDecompile);
            const mainClasses = await jadx.getMainApplicationClasses();
            if (mainClasses.length > 0) {
              info(`Auto-detected ${mainClasses.length} main application classes.`);
              // Find common prefix
              const parts = mainClasses[0].split('.');
              pkgPrefix = parts.slice(0, 3).join('.');
              info(`Using package prefix filter: ${pkgPrefix}`);
            }
          }

          const result = await jadx.decompilePackage(apkToDecompile, outDir, pkgPrefix);
          success(`All source files saved in: ${path.resolve(result.outputDir)}`);
        } finally {
          jadx.stop();
        }
        break;
      }

      case 'reconstruct': {
        const targetPath = args[1] || './output/xapk_extracted/Universal+TV+Remote+_+All+TV_1.0.6_APKPure/com.universaltv.remotecontrol.tvremote.apk';
        let apkToReconstruct = targetPath;
        if (targetPath && fs.existsSync(targetPath)) {
          const resolvedTarget = path.resolve(targetPath);
          const ext = path.extname(resolvedTarget).toLowerCase();
          if (ext === '.xapk' || ext === '.apkm') {
            const extractDir = path.resolve('./output/xapk_extracted', path.basename(resolvedTarget, ext));
            ensureDirSync(extractDir);
            try {
              execSync(`tar -xf "${resolvedTarget}" -C "${extractDir}"`);
            } catch (_) {}
            const apks = fs.readdirSync(extractDir, { recursive: true }).filter(f => f.endsWith('.apk'));
            let baseApk = apks.find(f => path.basename(f).toLowerCase() === 'base.apk') || apks[0];
            apkToReconstruct = path.join(extractDir, baseApk);
          } else {
            apkToReconstruct = resolvedTarget;
          }
        }

        let outDir = './reconstructed_tv_remote';
        const outIdx = args.findIndex(a => a === '--output' || a === '-o');
        if (outIdx !== -1 && args[outIdx + 1]) {
          outDir = args[outIdx + 1];
        }

        header('Reconstructing Android Studio Project');
        const reconstructor = new ProjectReconstructor({
          targetDir: outDir,
          apkPath: apkToReconstruct
        });
        await reconstructor.buildProject();
        break;
      }

      case 'analyze':
      case 'apk':
      case 'js': {
        const targetPath = args[1];
        if (!targetPath) {
          error(`Target path required for command '${command}'.`);
          printHelp();
          process.exit(1);
        }

        const options = {
          outputDir: './output',
          decodeResources: args.includes('--decode-resources') || args.includes('-d'),
          recoverSources: args.includes('--decode-resources') || args.includes('-d')
        };

        const outIdx = args.findIndex(a => a === '--output' || a === '-o');
        if (outIdx !== -1 && args[outIdx + 1]) {
          options.outputDir = args[outIdx + 1];
        }

        const ext = path.extname(targetPath).toLowerCase();
        const isApk = command === 'apk' || ext === '.apk' || ext === '.xapk' || ext === '.apkm';

        header(`Reverse Engineering Target: ${path.basename(targetPath)}`);

        if (isApk) {
          const analyzer = new AndroidAnalyzer(rea);
          const result = await analyzer.analyze(targetPath, options);
          const report = Reporter.saveReport(result, options.outputDir);
          success(`Analysis completed! View report at: ${report.mdPath}`);
        } else {
          const analyzer = new JsAnalyzer(rea);
          const result = await analyzer.analyze(targetPath, options);
          const report = Reporter.saveReport(result, options.outputDir);
          success(`Analysis completed! View report at: ${report.mdPath}`);
        }
        break;
      }

      default:
        error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    error(`Execution failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
