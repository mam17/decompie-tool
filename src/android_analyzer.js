import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { computeFileHash, formatBytes, ensureDirSync, info, warn, success } from './utils.js';

const DANGEROUS_PERMISSIONS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.SEND_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_MMS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.PACKAGE_USAGE_STATS'
];

const KNOWN_SDKS = [
  { name: 'Google Play Services / Firebase', pattern: /com\.google\.android\.gms|com\.google\.firebase/ },
  { name: 'Facebook SDK', pattern: /com\.facebook/ },
  { name: 'AdMob', pattern: /com\.google\.android\.gms\.ads/ },
  { name: 'AppLovin', pattern: /com\.applovin/ },
  { name: 'Unity Ads / Engine', pattern: /com\.unity3d/ },
  { name: 'AppsFlyer', pattern: /com\.appsflyer/ },
  { name: 'Adjust', pattern: /com\.adjust\.sdk/ },
  { name: 'Retrofit / OkHttp', pattern: /retrofit2|okhttp3/ },
  { name: 'Kotlin Coroutines', pattern: /kotlinx\.coroutines/ },
  { name: 'Jetpack Compose', pattern: /androidx\.compose/ },
  { name: 'RxJava', pattern: /io\.reactivex/ },
  { name: 'Google Play Billing', pattern: /com\.android\.billingclient/ },
  { name: 'Pairip Anti-Tamper / Licensing', pattern: /com\.pairip/ }
];

export class AndroidAnalyzer {
  constructor(reaBridge) {
    this.rea = reaBridge;
    this.aaptPath = this.findAapt();
  }

  findAapt() {
    const candidates = [];
    const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
    const buildToolsDir = path.join(sdkRoot, 'build-tools');

    if (fs.existsSync(buildToolsDir)) {
      try {
        const versions = fs.readdirSync(buildToolsDir).sort().reverse();
        for (const ver of versions) {
          const aaptExe = path.join(buildToolsDir, ver, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
          if (fs.existsSync(aaptExe)) {
            candidates.push(aaptExe);
          }
        }
      } catch (_) {}
    }

    if (candidates.length > 0) return candidates[0];

    try {
      execSync('aapt version', { stdio: 'ignore' });
      return 'aapt';
    } catch (_) {
      return null;
    }
  }

  parseWithAapt(apkPath) {
    if (!this.aaptPath) return null;

    try {
      const badgingOutput = execSync(`"${this.aaptPath}" dump badging "${apkPath}"`, {
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8'
      });

      const pkgMatch = badgingOutput.match(/package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/);
      const minSdkMatch = badgingOutput.match(/sdkVersion:'([^']*)'/);
      const targetSdkMatch = badgingOutput.match(/targetSdkVersion:'([^']*)'/);
      const appLabelMatch = badgingOutput.match(/application-label:'([^']*)'/);
      const launchableMatch = badgingOutput.match(/launchable-activity: name='([^']+)'/);

      const permissions = [];
      const permRegex = /uses-permission: name='([^']+)'/g;
      let pMatch;
      while ((pMatch = permRegex.exec(badgingOutput)) !== null) {
        if (!permissions.includes(pMatch[1])) permissions.push(pMatch[1]);
      }

      // Parse XML Tree for activities, services, receivers and exported flags
      let activities = [];
      let services = [];
      let receivers = [];
      let providers = [];
      let isDebuggable = false;

      try {
        const xmlOutput = execSync(`"${this.aaptPath}" dump xmltree "${apkPath}" AndroidManifest.xml`, {
          maxBuffer: 20 * 1024 * 1024,
          encoding: 'utf8'
        });

        if (xmlOutput.includes('android:debuggable(0x0101000f)=(type 0x12)0xffffffff')) {
          isDebuggable = true;
        }

        const componentBlocks = xmlOutput.split(/E: (activity|service|receiver|provider) /g);
        for (let i = 1; i < componentBlocks.length; i += 2) {
          const type = componentBlocks[i];
          const content = componentBlocks[i + 1] || '';

          const nameMatch = content.match(/A: android:name\([^)]*\)="([^"]+)"/);
          if (nameMatch) {
            const comp = {
              name: nameMatch[1],
              exported: content.includes('android:exported(0x01010010)=(type 0x12)0xffffffff'),
              permission: (content.match(/A: android:permission\([^)]*\)="([^"]+)"/) || [])[1] || null
            };

            if (type === 'activity') activities.push(comp);
            else if (type === 'service') services.push(comp);
            else if (type === 'receiver') receivers.push(comp);
            else if (type === 'provider') providers.push(comp);
          }
        }
      } catch (_) {}

      return {
        package_name: pkgMatch ? pkgMatch[1] : null,
        version_code: pkgMatch ? pkgMatch[2] : null,
        version_name: pkgMatch ? pkgMatch[3] : null,
        min_sdk: minSdkMatch ? minSdkMatch[1] : null,
        target_sdk: targetSdkMatch ? targetSdkMatch[1] : null,
        application_label: appLabelMatch ? appLabelMatch[1] : null,
        launchable_activity: launchableMatch ? launchableMatch[1] : null,
        permissions,
        activities,
        services,
        receivers,
        providers,
        application: {
          debuggable: isDebuggable,
          allowBackup: true
        }
      };
    } catch (err) {
      warn(`AAPT inspection error: ${err.message}`);
      return null;
    }
  }

  scanDexClasses(apkPath, workDir) {
    const dexDir = path.join(workDir, 'dex_dump');
    ensureDirSync(dexDir);
    const classes = [];

    try {
      execSync(`tar -xf "${apkPath}" -C "${dexDir}"`);
      const dexFiles = fs.readdirSync(dexDir).filter(f => f.endsWith('.dex'));

      for (const dex of dexFiles) {
        const fullPath = path.join(dexDir, dex);
        const buf = fs.readFileSync(fullPath);

        // Simple string scanning in DEX for class descriptors (L...;)
        let current = '';
        for (let i = 0; i < buf.length; i++) {
          const byte = buf[i];
          if (byte >= 32 && byte <= 126) {
            current += String.fromCharCode(byte);
          } else {
            if (current.startsWith('L') && current.endsWith(';') && current.includes('/')) {
              const className = current.slice(1, -1).replace(/\//g, '.');
              if (!classes.includes(className)) {
                classes.push(className);
              }
            }
            current = '';
          }
        }
      }
    } catch (_) {}

    return classes;
  }

  async analyze(targetPath, options = {}) {
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Target file does not exist: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const isXapk = ext === '.xapk' || ext === '.apkm';

    info(`Analyzing target: ${path.basename(resolvedPath)} (${formatBytes(stats.size)}) [Format: ${isXapk ? 'XAPK/APKM' : 'APK'}]`);

    const fileHash = await computeFileHash(resolvedPath);
    let targetApkPath = resolvedPath;
    let xapkDetails = null;

    // Handle XAPK / APKM package extraction
    if (isXapk) {
      const baseOut = options.outputDir || './output';
      const xapkExtractDir = path.resolve(baseOut, 'xapk_extracted', path.basename(resolvedPath, ext));
      ensureDirSync(xapkExtractDir);

      info(`Extracting XAPK container to: ${xapkExtractDir}...`);
      try {
        execSync(`tar -xf "${resolvedPath}" -C "${xapkExtractDir}"`);
      } catch (e) {
        throw new Error(`Failed to extract XAPK container: ${e.message}`);
      }

      // Read manifest.json inside XAPK if exists
      const manifestJsonPath = path.join(xapkExtractDir, 'manifest.json');
      let xapkManifest = null;
      if (fs.existsSync(manifestJsonPath)) {
        try {
          xapkManifest = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
        } catch (_) {}
      }

      // Collect all APKs inside the XAPK
      const allExtractedFiles = fs.readdirSync(xapkExtractDir, { recursive: true });
      const apkFiles = allExtractedFiles
        .filter(f => f.endsWith('.apk'))
        .map(f => path.join(xapkExtractDir, f));

      if (apkFiles.length === 0) {
        throw new Error(`Invalid XAPK: No .apk files found inside container.`);
      }

      // Locate base APK (usually base.apk or the largest apk)
      let primaryApk = apkFiles.find(f => path.basename(f).toLowerCase() === 'base.apk');
      if (!primaryApk) {
        apkFiles.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
        primaryApk = apkFiles[0];
      }

      targetApkPath = primaryApk;
      xapkDetails = {
        extractedDir: xapkExtractDir,
        manifest: xapkManifest,
        primaryApk: path.basename(primaryApk),
        splitApks: apkFiles.map(f => ({
          name: path.basename(f),
          sizeFormatted: formatBytes(fs.statSync(f).size)
        }))
      };

      success(`Found ${apkFiles.length} APK(s) inside XAPK. Selected primary APK: ${path.basename(primaryApk)}`);
    }

    const result = {
      target: {
        path: resolvedPath,
        fileName: path.basename(resolvedPath),
        isXapk,
        xapkDetails,
        primaryApkPath: targetApkPath,
        sizeBytes: stats.size,
        sizeFormatted: formatBytes(stats.size),
        sha256: fileHash
      },
      packageInfo: null,
      classes: [],
      security: {
        dangerousPermissions: [],
        exportedComponents: [],
        debuggable: false,
        allowBackup: true,
        networkSecurityConfigPresent: false,
        findings: []
      },
      detectedSdks: [],
      reaEvidence: null
    };

    // Step 1: Use AAPT as high-precision fast parser for Manifest and Components
    if (this.aaptPath) {
      info(`Using Android SDK AAPT (${this.aaptPath}) for Manifest parsing...`);
      const aaptData = this.parseWithAapt(targetApkPath);
      if (aaptData) {
        result.packageInfo = aaptData;
        success(`Parsed metadata via AAPT: ${aaptData.package_name} v${aaptData.version_name} (targetSdk ${aaptData.target_sdk})`);
      }
    }

    // Step 2: Query REA for Android package metadata if needed
    info(`Querying REA for package metadata (${path.basename(targetApkPath)})...`);
    const packageRes = await this.rea.inspectAndroidPackage(targetApkPath);
    if (packageRes.success && packageRes.data && !packageRes.data.code) {
      result.packageInfo = { ...result.packageInfo, ...packageRes.data };
      result.reaEvidence = packageRes.data;
      success('Merged REA package metadata.');
    } else {
      result.reaEvidence = packageRes.data;
      if (!result.packageInfo) {
        warn(`REA inspect-android-package returned: ${packageRes.error || packageRes.data?.message || 'No metadata'}`);
      }
    }

    // Step 3: Class Inventory (from REA or native DEX scanning)
    info('Scanning classes and DEX bytecode...');
    const classesRes = await this.rea.searchAndroidClasses(targetApkPath, '');
    if (classesRes.success && classesRes.data && !classesRes.data.code) {
      result.classes = Array.isArray(classesRes.data)
        ? classesRes.data
        : (classesRes.data.classes || classesRes.data.items || []);
      success(`Found ${result.classes.length} classes via REA.`);
    } else {
      // Fallback: Scan DEX classes natively
      const baseOut = options.outputDir || './output';
      const scannedClasses = this.scanDexClasses(targetApkPath, path.join(baseOut, '.cache'));
      result.classes = scannedClasses;
      success(`Discovered ${scannedClasses.length} classes across DEX files.`);
    }

    // Step 4: Decode resources if requested
    if (options.outputDir && options.decodeResources) {
      const resDir = path.join(options.outputDir, 'resources');
      ensureDirSync(resDir);
      info(`Extracting Android resources to ${resDir}...`);
      try {
        execSync(`tar -xf "${targetApkPath}" -C "${resDir}" res assets`);
        success('Android resources and assets extracted.');
      } catch (_) {}

      const decodeRes = await this.rea.decodeAndroidResources(targetApkPath, resDir);
      if (decodeRes.success) {
        success('Android resources decoded.');
      }
    }

    // Step 5: Security Analysis
    this.evaluateSecurity(result);

    // Step 6: SDK detection
    this.detectSdks(result);

    return result;
  }

  evaluateSecurity(result) {
    const pkg = result.packageInfo || {};
    const permissions = pkg.permissions || pkg.requested_permissions || [];

    // Filter dangerous permissions
    result.security.dangerousPermissions = permissions.filter(p => {
      const name = typeof p === 'string' ? p : p.name;
      return DANGEROUS_PERMISSIONS.includes(name);
    });

    if (result.security.dangerousPermissions.length > 0) {
      result.security.findings.push({
        severity: 'MEDIUM',
        title: 'Dangerous Permissions Requested',
        description: `App requests ${result.security.dangerousPermissions.length} sensitive permissions: ${result.security.dangerousPermissions.join(', ')}`
      });
    }

    // Exported components
    const activities = pkg.activities || [];
    const services = pkg.services || [];
    const receivers = pkg.receivers || [];
    const providers = pkg.providers || [];

    const allComponents = [
      ...activities.map(a => ({ type: 'Activity', ...a })),
      ...services.map(s => ({ type: 'Service', ...s })),
      ...receivers.map(r => ({ type: 'Receiver', ...r })),
      ...providers.map(p => ({ type: 'Provider', ...p }))
    ];

    result.security.exportedComponents = allComponents.filter(c => c.exported === true);

    if (result.security.exportedComponents.length > 0) {
      result.security.findings.push({
        severity: 'LOW_TO_MEDIUM',
        title: 'Exported Components Detected',
        description: `App exposes ${result.security.exportedComponents.length} components to other applications without restriction.`
      });
    }

    // Debuggable flag check
    if (pkg.application && pkg.application.debuggable) {
      result.security.debuggable = true;
      result.security.findings.push({
        severity: 'HIGH',
        title: 'Application is Debuggable',
        description: 'android:debuggable is set to true. Attackers can attach a debugger, inspect memory, and tamper with execution.'
      });
    }

    if (pkg.application && pkg.application.allowBackup === false) {
      result.security.allowBackup = false;
    }
  }

  detectSdks(result) {
    const classNames = result.classes.map(c => (typeof c === 'string' ? c : c.name || '')).join('\n');
    for (const sdk of KNOWN_SDKS) {
      if (sdk.pattern.test(classNames)) {
        result.detectedSdks.push(sdk.name);
      }
    }
  }
}
