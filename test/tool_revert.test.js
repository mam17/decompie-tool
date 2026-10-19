import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  Colors,
  computeFileHash,
  ensureDirSync,
  formatBytes,
  sanitizeFileName
} from '../src/utils.js';
import { Reporter } from '../src/reporter.js';
import { AndroidAnalyzer } from '../src/android_analyzer.js';

test('utils: formatBytes correctly formats units', () => {
  assert.equal(formatBytes(0), '0 Bytes');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1048576), '1 MB');
});

test('utils: sanitizeFileName replaces invalid characters', () => {
  assert.equal(sanitizeFileName('my/app:test?.apk'), 'my_app_test_.apk');
});

test('utils: computeFileHash computes SHA-256 for existing file', async () => {
  const tmpFile = path.resolve('./package.json');
  const hash = await computeFileHash(tmpFile);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
});

test('AndroidAnalyzer: evaluateSecurity identifies dangerous permissions and debuggable', () => {
  const dummyRea = {};
  const analyzer = new AndroidAnalyzer(dummyRea);
  const dummyResult = {
    packageInfo: {
      package_name: 'com.example.test',
      permissions: [
        'android.permission.INTERNET',
        'android.permission.READ_SMS',
        'android.permission.CAMERA'
      ],
      activities: [
        { name: '.MainActivity', exported: true },
        { name: '.PrivateActivity', exported: false }
      ],
      application: {
        debuggable: true
      }
    },
    classes: ['com.google.android.gms.ads.MobileAds', 'com.example.test.MainActivity'],
    security: {
      dangerousPermissions: [],
      exportedComponents: [],
      debuggable: false,
      allowBackup: true,
      findings: []
    },
    detectedSdks: []
  };

  analyzer.evaluateSecurity(dummyResult);
  analyzer.detectSdks(dummyResult);

  assert.equal(dummyResult.security.debuggable, true);
  assert.equal(dummyResult.security.dangerousPermissions.length, 2);
  assert.equal(dummyResult.security.exportedComponents.length, 1);
  assert.ok(dummyResult.detectedSdks.includes('AdMob'));
});

test('Reporter: generates markdown report properly', () => {
  const dummyData = {
    target: {
      fileName: 'sample.apk',
      path: '/path/to/sample.apk',
      sizeFormatted: '15 MB',
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    },
    packageInfo: {
      package_name: 'com.test.app',
      version_name: '1.0.0'
    },
    security: {
      findings: [{ severity: 'HIGH', title: 'Test Finding', description: 'Test desc' }],
      dangerousPermissions: ['android.permission.CAMERA'],
      exportedComponents: [{ type: 'Activity', name: '.MainActivity', permission: null }]
    },
    detectedSdks: ['AdMob']
  };

  const md = Reporter.generateMarkdown(dummyData);
  assert.ok(md.includes('Reverse Engineering Report: sample.apk'));
  assert.ok(md.includes('com.test.app'));
  assert.ok(md.includes('Test Finding'));
  assert.ok(md.includes('android.permission.CAMERA'));
});

test('Reporter: generates XAPK bundle breakdown properly', () => {
  const dummyXapkData = {
    target: {
      fileName: 'game.xapk',
      path: '/path/to/game.xapk',
      isXapk: true,
      sizeFormatted: '120 MB',
      xapkDetails: {
        primaryApk: 'base.apk',
        splitApks: [
          { name: 'base.apk', sizeFormatted: '90 MB' },
          { name: 'config.arm64_v8a.apk', sizeFormatted: '30 MB' }
        ]
      }
    },
    packageInfo: {
      package_name: 'com.game.sample'
    },
    security: {
      findings: [],
      dangerousPermissions: [],
      exportedComponents: []
    }
  };

  const md = Reporter.generateMarkdown(dummyXapkData);
  assert.ok(md.includes('XAPK / APKM Bundle'));
  assert.ok(md.includes('config.arm64_v8a.apk'));
  assert.ok(md.includes('base.apk'));
});

test('ProjectReconstructor: initializes with custom or default paths', async () => {
  const { ProjectReconstructor } = await import('../src/project_reconstructor.js');
  const customTarget = './custom_output_app';
  const reconstructor = new ProjectReconstructor({
    targetDir: customTarget,
    apkPath: './sample.apk'
  });
  assert.ok(reconstructor.targetDir.includes('custom_output_app'));
  assert.ok(reconstructor.apkPath.includes('sample.apk'));
});

test('ProjectReconstructor: cleanManifest removes PairIP anti-tamper and library stubs', async () => {
  const { ProjectReconstructor } = await import('../src/project_reconstructor.js');
  const reconstructor = new ProjectReconstructor();
  const rawXml = `
    <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.test.app">
      <application android:name="com.pairip.application.Application" android:label="App">
        <provider android:name="com.google.firebase.provider.FirebaseInitProvider" android:authorities="com.test.firebaseinitprovider"/>
        <activity android:name="com.pairip.licensecheck.LicenseActivity" android:exported="false"/>
      </application>
      <uses-permission android:name="com.android.vending.CHECK_LICENSE"/>
    </manifest>
  `;
  const cleaned = reconstructor.cleanManifest(rawXml);
  assert.ok(!cleaned.includes('com.pairip.application.Application'));
  assert.ok(!cleaned.includes('LicenseActivity'));
  assert.ok(!cleaned.includes('CHECK_LICENSE'));
  assert.ok(!cleaned.includes('FirebaseInitProvider'));
});

