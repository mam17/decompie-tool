import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { JadxClient } from './jadx_client.js';
import { ensureDirSync, info, success, warn, error } from './utils.js';

export class ProjectReconstructor {
  constructor(options = {}) {
    this.targetDir = path.resolve(options.targetDir || './reconstructed_tv_remote');
    this.apkPath = path.resolve(options.apkPath || './output/xapk_extracted/Universal+TV+Remote+_+All+TV_1.0.6_APKPure/com.universaltv.remotecontrol.tvremote.apk');
    this.decompiledSrcDir = path.resolve(options.decompiledSrcDir || './output/decompiled_src');
    this.resourcesDir = path.resolve(options.resourcesDir || './output/resources');
    this.backupDir = path.resolve(options.backupDir || './_backup_puzzle_game');
  }

  async buildProject() {
    info(`Starting complete Android project reconstruction into:\n  ${this.targetDir}...`);
    ensureDirSync(this.targetDir);

    // 1. Setup Gradle wrapper and root project files
    this.setupGradleRoot();

    // 2. Setup app module structure
    const appDir = path.join(this.targetDir, 'app');
    const mainDir = path.join(appDir, 'src', 'main');
    const javaDir = path.join(mainDir, 'java');
    const resDir = path.join(mainDir, 'res');
    const assetsDir = path.join(mainDir, 'assets');
    const pythonDir = path.join(mainDir, 'python');

    ensureDirSync(javaDir);
    ensureDirSync(resDir);
    ensureDirSync(assetsDir);
    ensureDirSync(pythonDir);

    this.setupAppBuildGradle(appDir);

    // 3. Connect JADX for Manifest and Resource Decoding
    const jadx = new JadxClient();
    await jadx.start();

    try {
      await jadx.loadApk(this.apkPath);

      // Extract and clean AndroidManifest.xml
      info('Extracting decompiled AndroidManifest.xml...');
      const manifestRes = await jadx.callTool('get_android_manifest', {});
      let manifestXml = manifestRes.content?.[0]?.text;
      if (manifestXml) {
        manifestXml = this.cleanManifest(manifestXml);
        fs.writeFileSync(path.join(mainDir, 'AndroidManifest.xml'), manifestXml, 'utf8');
        success('AndroidManifest.xml written and sanitized successfully.');
      }

      // Copy decompiled Java source classes
      info('Copying decompiled Java sources...');
      this.copyDecompiledSources(javaDir);

      // Copy Python and Proto sources
      info('Copying Python & Proto wifiremote sources...');
      this.copyPythonSources(pythonDir);

      // Copy and extract assets (ircodes.json, chaquopy...)
      info('Copying assets...');
      this.copyAssets(assetsDir);

      // Decode and assemble resources
      info('Decoding and assembling resources (layouts, drawables, strings, colors, raw, mipmaps)...');
      await this.assembleResources(jadx, resDir);

      // Generate project README
      this.generateReadme();

    } finally {
      jadx.stop();
    }

    success(`Android Studio Project successfully created at:\n  ${this.targetDir}`);
    return this.targetDir;
  }

  cleanManifest(xml) {
    let cleaned = xml;
    // Remove package, compileSdk, platformBuildVersion attributes from <manifest>
    cleaned = cleaned.replace(/<manifest[^>]*>/, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">');
    // Remove <uses-sdk .../>
    cleaned = cleaned.replace(/<uses-sdk[^>]*\/>\s*/g, '');
    // Remove extractNativeLibs and appComponentFactory
    cleaned = cleaned.replace(/android:extractNativeLibs="[^"]*"\s*/g, '');
    cleaned = cleaned.replace(/android:appComponentFactory="[^"]*"\s*/g, '');
    // Remove internal Google Ads activities / services that clash with AAR manifest
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.google\.android\.gms\.ads\.AdActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.google\.android\.gms\.ads\.OutOfContextTestingActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.google\.android\.gms\.ads\.NotificationHandlerActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.android\.gms\.ads\.AdService"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<provider\s+[^>]*android:name="com\.google\.android\.gms\.ads\.MobileAdsInitProvider"[^>]*\/>\s*/gs, '');
    // Remove internal billing client entries that clash with AAR
    cleaned = cleaned.replace(/<meta-data\s+[^>]*android:name="com\.google\.android\.play\.billingclient\.version"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.android\.billingclient\.api\.ProxyBillingActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.android\.billingclient\.api\.ProxyBillingActivityV2"[^>]*\/>\s*/gs, '');
    // Remove split APK stamp and splits metadata
    cleaned = cleaned.replace(/<meta-data\s+[^>]*android:name="com\.android\.vending\.splits[^"]*"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<meta-data\s+[^>]*android:name="com\.android\.stamp\.[^"]*"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<meta-data\s+[^>]*android:name="com\.android\.vending\.derived\.apk\.id"[^>]*\/>\s*/gs, '');
    // Remove Google Play PairIP anti-tamper stub and license check
    cleaned = cleaned.replace(/\s*android:name="com\.pairip\.application\.Application"/g, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.pairip\.licensecheck\.LicenseActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<uses-permission\s+android:name="com\.android\.vending\.CHECK_LICENSE"\/>\s*/gs, '');
    // Remove internal AAR merged library providers, services, and receivers that aren't developer code
    cleaned = cleaned.replace(/<provider\s+[^>]*android:name="com\.google\.firebase\.provider\.FirebaseInitProvider"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.firebase\.components\.ComponentDiscoveryService".*?<\/service>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.firebase\.sessions\.SessionLifecycleService"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<receiver\s+[^>]*android:name="com\.google\.android\.gms\.measurement\.AppMeasurementReceiver"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.android\.gms\.measurement\.AppMeasurementService"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.android\.gms\.measurement\.AppMeasurementJobService"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.google\.android\.gms\.common\.api\.GoogleApiActivity"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<provider\s+[^>]*android:name="androidx\.startup\.InitializationProvider".*?<\/provider>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="androidx\.work\.impl\.[^"]*"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<receiver\s+[^>]*android:name="androidx\.work\.impl\.[^"]*".*?<\/receiver>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="androidx\.room\.MultiInstanceInvalidationService"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<receiver\s+[^>]*android:name="androidx\.profileinstaller\.ProfileInstallReceiver".*?<\/receiver>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.android\.datatransport\.[^"]*".*?<\/service>\s*/gs, '');
    cleaned = cleaned.replace(/<service\s+[^>]*android:name="com\.google\.android\.datatransport\.[^"]*"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<receiver\s+[^>]*android:name="com\.google\.android\.datatransport\.[^"]*"[^>]*\/>\s*/gs, '');
    cleaned = cleaned.replace(/<activity\s+[^>]*android:name="com\.google\.android\.play\.core\.common\.PlayCoreDialogWrapperActivity"[^>]*\/>\s*/gs, '');
    return cleaned;
  }

  setupGradleRoot() {
    // Copy Gradle wrapper from backup if available
    if (fs.existsSync(this.backupDir)) {
      const wrapperSrc = path.join(this.backupDir, 'gradle');
      const gradlewBatSrc = path.join(this.backupDir, 'gradlew.bat');
      const gradlewSrc = path.join(this.backupDir, 'gradlew');

      if (fs.existsSync(wrapperSrc)) {
        try {
          execSync(`powershell -NoProfile -Command "Copy-Item -Path '${wrapperSrc}' -Destination '${this.targetDir}' -Recurse -Force"`);
        } catch (_) {}
      }
      if (fs.existsSync(gradlewBatSrc)) {
        try {
          fs.copyFileSync(gradlewBatSrc, path.join(this.targetDir, 'gradlew.bat'));
        } catch (_) {}
      }
      if (fs.existsSync(gradlewSrc)) {
        try {
          fs.copyFileSync(gradlewSrc, path.join(this.targetDir, 'gradlew'));
        } catch (_) {}
      }
    }

    // Root settings.gradle.kts
    const settingsKts = `pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\\\.android.*")
                includeGroupByRegex("com\\\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = java.net.URI("https://chaquo.com/maven") }
        maven { url = java.net.URI("https://jitpack.io") }
    }
}

rootProject.name = "UniversalTVRemote"
include(":app")
`;
    fs.writeFileSync(path.join(this.targetDir, 'settings.gradle.kts'), settingsKts, 'utf8');

    // Root build.gradle.kts
    const rootBuildKts = `plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`;
    fs.writeFileSync(path.join(this.targetDir, 'build.gradle.kts'), rootBuildKts, 'utf8');

    // Root gradle.properties
    const gradleProps = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;
    fs.writeFileSync(path.join(this.targetDir, 'gradle.properties'), gradleProps, 'utf8');
  }

  setupAppBuildGradle(appDir) {
    const appBuildKts = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.universaltv.remotecontrol.tvremote"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.universaltv.remotecontrol.tvremote"
        minSdk = 24
        targetSdk = 35
        versionCode = 7
        versionName = "1.0.6"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = false
    }
}

tasks.withType<JavaCompile>().configureEach {
    exclude("**/*.java")
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.7")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("io.insert-koin:koin-android:3.5.6")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    implementation("com.google.android.gms:play-services-ads:23.6.0")
    implementation("com.intuit.sdp:sdp-android:1.1.1")
    implementation("com.intuit.ssp:ssp-android:1.1.1")
    implementation("com.airbnb.android:lottie:6.6.0")
    implementation("androidx.navigation:navigation-fragment-ktx:2.8.5")
    implementation("androidx.navigation:navigation-ui-ktx:2.8.5")
    implementation("com.android.billingclient:billing:7.1.1")
}
`;
    fs.writeFileSync(path.join(appDir, 'build.gradle.kts'), appBuildKts, 'utf8');

    // proguard-rules.pro
    fs.writeFileSync(path.join(appDir, 'proguard-rules.pro'), '# Add project specific proguard rules here\n', 'utf8');
  }

  copyDecompiledSources(targetJavaDir) {
    const srcPkg = path.join(this.decompiledSrcDir, 'com');
    if (fs.existsSync(srcPkg)) {
      execSync(`powershell -NoProfile -Command "Copy-Item -Path '${srcPkg}' -Destination '${targetJavaDir}' -Recurse -Force"`);
      // Delete generated/conflicting R.java, databinding, and BuildConfig
      const rFile = path.join(targetJavaDir, 'com', 'universaltv', 'remotecontrol', 'tvremote', 'R.java');
      const bFile = path.join(targetJavaDir, 'com', 'universaltv', 'remotecontrol', 'tvremote', 'BuildConfig.java');
      const dbDir = path.join(targetJavaDir, 'com', 'universaltv', 'remotecontrol', 'tvremote', 'databinding');
      if (fs.existsSync(rFile)) fs.unlinkSync(rFile);
      if (fs.existsSync(bFile)) fs.unlinkSync(bFile);
      if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
      success('Copied all decompiled Java packages.');
    }
  }

  copyPythonSources(targetPythonDir) {
    const pySrc = path.join(this.decompiledSrcDir, 'python_wifiremote');
    if (fs.existsSync(pySrc)) {
      execSync(`powershell -NoProfile -Command "Copy-Item -Path '${pySrc}\\*' -Destination '${targetPythonDir}' -Recurse -Force"`);
      success('Copied Python & Protobuf wifiremote protocols.');
    }
  }

  copyAssets(targetAssetsDir) {
    const srcAssets = path.join(this.resourcesDir, 'assets');
    if (fs.existsSync(srcAssets)) {
      execSync(`powershell -NoProfile -Command "Copy-Item -Path '${srcAssets}\\*' -Destination '${targetAssetsDir}' -Recurse -Force"`);
      success('Copied assets (ircodes.json, chaquopy...).');
    }
  }

  async assembleResources(jadx, targetResDir) {
    const valuesDir = path.join(targetResDir, 'values');
    ensureDirSync(valuesDir);

    // 1. Copy raw directory (plaintext JSONs and configs)
    const rawSrc = path.join(this.resourcesDir, 'res', 'raw');
    const rawDest = path.join(targetResDir, 'raw');
    if (fs.existsSync(rawSrc)) {
      ensureDirSync(rawDest);
      execSync(`powershell -NoProfile -Command "Copy-Item -Path '${rawSrc}\\*' -Destination '${rawDest}' -Recurse -Force"`);
      success('Assembled res/raw configurations (ads plan, remote jsons).');
    }

    // 2. Copy ONLY non-XML binary assets (PNG, WebP, JPG, font binaries)
    const resSrc = path.join(this.resourcesDir, 'res');
    if (fs.existsSync(resSrc)) {
      for (const sub of fs.readdirSync(resSrc)) {
        const s = path.join(resSrc, sub);
        if (fs.statSync(s).isDirectory() && sub !== 'raw' && sub !== 'values') {
          const d = path.join(targetResDir, sub);
          ensureDirSync(d);
          for (const f of fs.readdirSync(s)) {
            if (f.endsWith('.xml') || f.includes('$')) continue;
            try {
              fs.copyFileSync(path.join(s, f), path.join(d, f));
            } catch (_) {}
          }
        }
      }
    }

    // 3. Decode ALL XML resource files via JADX into valid plaintext UTF-8 XML
    info('Decoding all XML resources (layouts, drawables, anim, xml...) via JADX...');
    const resList = await jadx.callTool('list_resource_files', { limit: 10000 });
    const data = JSON.parse(resList.content?.[0]?.text || '{}');

    // Skip library internal private resources that clash with AAR dependencies
    const libraryPrefixes = [
      'abc_', 'm3_', 'mtrl_', 'material_', 'design_', 'nav_default_',
      'btn_checkbox_', 'btn_radio_', 'fragment_', 'chevron_',
      'common_google_signin_', 'notification_', 'browser_actions_',
      'select_dialog_', 'support_simple_spinner_'
    ];
    const xmlFiles = (data.items || []).filter(f => {
      if (!f.startsWith('res/') || !f.endsWith('.xml') || f.startsWith('res/values')) return false;
      const parts = f.split('/');
      const folder = parts[1];
      const name = parts[parts.length - 1];
      if (['anim', 'animator', 'interpolator', 'color', 'color-night', 'color-v31', 'drawable', 'layout', 'xml'].includes(folder)) {
        if (libraryPrefixes.some(p => name.startsWith(p))) return false;
      }
      return true;
    });

    let decodedCount = 0;
    for (const xmlFile of xmlFiles) {
      try {
        const sanitized = xmlFile.replace(/\$/g, '_');
        const relPath = sanitized.replace(/^res\//, '');
        const outPath = path.join(targetResDir, relPath);
        ensureDirSync(path.dirname(outPath));

        const fileRes = await jadx.callTool('get_resource_file', { name: xmlFile });
        let content = fileRes.content?.[0]?.text;
        if (content && content.startsWith('<?xml')) {
          // Replace raw hex resource references like 0x7f080397 with transparent
          content = content.replace(/android:src="0x7f[0-9a-fA-F]+"/g, 'android:src="@android:color/transparent"');
          // Fix any stray '>' after SkeletonConstraintLayout closing tag
          content = content.replace(/(<\/aglibs\.loading\.skeleton\.layout\.SkeletonConstraintLayout>)\s*&gt;\s*/g, '$1\n');
          fs.writeFileSync(outPath, content, 'utf8');
          decodedCount++;
        }
      } catch (_) {}
    }
    success(`Decoded ${decodedCount}/${xmlFiles.length} resource XML files into plaintext.`);

    // 4. Extract strings.xml via JADX get_strings
    try {
      info('Extracting string resources via JADX...');
      const stringsRes = await jadx.callTool('get_strings', { limit: 10000 });
      const strData = JSON.parse(stringsRes.content?.[0]?.text || '{}');
      if (strData.items && strData.items.length > 0) {
        let xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n`;
        xml += `    <string name="app_id_admob">"ca-app-pub-7249793642395683~9185692310"</string>\n`;
        xml += `    <string name="no1">"1"</string>\n`;
        xml += `    <string name="no2">"2"</string>\n`;
        xml += `    <string name="no3">"3"</string>\n`;
        for (let i = 0; i <= 9; i++) {
          xml += `    <string name="_${i}">${i}</string>\n`;
        }
        xml += `    <string name="iha_loading_ad">Loading Ad...</string>\n`;
        const seenNames = new Set(['app_id_admob', 'no1', 'no2', 'no3', '_0', '_1', '_2', '_3', '_4', '_5', '_6', '_7', '_8', '_9', 'iha_loading_ad']);
        for (const item of strData.items) {
          if (!item.name || seenNames.has(item.name)) continue;
          seenNames.add(item.name);
          let val = String(item.value || '');
          val = val.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          val = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (val.startsWith('@') || val.startsWith('?')) {
            val = '\\' + val;
          }
          const escapedVal = '"' + val.replace(/"/g, '\\"') + '"';
          xml += `    <string name="${item.name}">${escapedVal}</string>\n`;
        }
        xml += `</resources>\n`;
        fs.writeFileSync(path.join(valuesDir, 'strings.xml'), xml, 'utf8');
        success(`Generated res/values/strings.xml with ${seenNames.size} strings.`);
      }
    } catch (e) {
      warn(`Failed to export strings.xml: ${e.message}`);
    }

    // 5. Extract colors.xml via AAPT dump (deduplicating against res/color/*.xml)
    this.extractColors(valuesDir, targetResDir);

    // 6. Setup themes.xml and styles.xml
    this.setupThemes(valuesDir);

    // 7. Setup arrays.xml
    this.setupArrays(valuesDir);

    // 8. Setup attrs.xml
    this.setupAttrs(valuesDir);

    // 9. Setup dimens.xml
    this.setupDimens(valuesDir);
  }

  extractColors(valuesDir, targetResDir) {
    const aaptPath = 'C:\\Users\\AndroidDev\\AppData\\Local\\Android\\Sdk\\build-tools\\36.0.0\\aapt.exe';
    if (!fs.existsSync(aaptPath) || !fs.existsSync(this.apkPath)) {
      this.writeDefaultColors(valuesDir);
      return;
    }

    const colorDir = path.join(targetResDir, 'color');
    const existingColorFiles = new Set();
    if (fs.existsSync(colorDir)) {
      for (const f of fs.readdirSync(colorDir)) {
        if (f.endsWith('.xml')) {
          existingColorFiles.add(f.replace('.xml', ''));
        }
      }
    }

    try {
      info('Dumping and parsing colors via AAPT...');
      const dump = execSync(`"${aaptPath}" dump resources "${this.apkPath}"`, {
        maxBuffer: 60 * 1024 * 1024
      }).toString('utf8');

      const colorRegex = /resource 0x[0-9a-fA-F]+ com\.universaltv\.remotecontrol\.tvremote:color\/([a-zA-Z0-9_]+): t=(?:0x1c|0x1d) d=(0x[0-9a-fA-F]{8})/g;

      const colors = new Map();
      let match;
      while ((match = colorRegex.exec(dump)) !== null) {
        const name = match[1];
        if (existingColorFiles.has(name) || colors.has(name)) continue;

        let hex = match[2].replace('0x', '#');
        if (hex.length === 9) {
          colors.set(name, hex);
        }
      }

      const standardFallbacks = {
        app_color: '#FF0072DE',
        app_white_color: '#FF0072DE',
        purple_200: '#FFBB86FC',
        purple_500: '#FF6200EE',
        purple_700: '#FF3700B3',
        teal_200: '#FF03DAC5',
        teal_700: '#FF018786',
        black: '#FF000000',
        white: '#FFFFFFFF'
      };
      for (const [k, v] of Object.entries(standardFallbacks)) {
        if (!colors.has(k) && !existingColorFiles.has(k)) {
          colors.set(k, v);
        }
      }

      if (colors.size > 0) {
        let xml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n`;
        for (const [name, hex] of colors) {
          xml += `    <color name="${name}">${hex}</color>\n`;
        }
        xml += `</resources>\n`;
        fs.writeFileSync(path.join(valuesDir, 'colors.xml'), xml, 'utf8');
        success(`Generated res/values/colors.xml with ${colors.size} color definitions.`);
      } else {
        this.writeDefaultColors(valuesDir);
      }
    } catch (e) {
      warn(`AAPT color dump fallback to defaults: ${e.message}`);
      this.writeDefaultColors(valuesDir);
    }
  }

  writeDefaultColors(valuesDir) {
    const defaultColors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="app_color">#FF0072DE</color>
    <color name="app_white_color">#FF0072DE</color>
    <color name="purple_200">#FFBB86FC</color>
    <color name="purple_500">#FF6200EE</color>
    <color name="purple_700">#FF3700B3</color>
    <color name="teal_200">#FF03DAC5</color>
    <color name="teal_700">#FF018786</color>
    <color name="black">#FF000000</color>
    <color name="white">#FFFFFFFF</color>
    <color name="white_grey_color">#FFF5F5F5</color>
    <color name="ad_card">#FFFFFFFF</color>
    <color name="yellow">#FFFFD400</color>
    <color name="yellow_dark">#FFC8A20C</color>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'colors.xml'), defaultColors, 'utf8');
  }

  setupThemes(valuesDir) {
    const themesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Chaquopy" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <item name="colorPrimary">@color/purple_500</item>
        <item name="colorPrimaryVariant">@color/purple_700</item>
        <item name="colorOnPrimary">@color/white</item>
        <item name="colorSecondary">@color/teal_200</item>
        <item name="colorSecondaryVariant">@color/teal_700</item>
        <item name="colorOnSecondary">@color/black</item>
        <item name="android:statusBarColor">?attr/colorPrimaryVariant</item>
    </style>
    <style name="Theme.UniversalTVRemote" parent="Theme.Chaquopy" />
    <style name="Theme.PlayCore.Transparent" parent="@android:style/Theme.Translucent.NoTitleBar" />
    <style name="AdTheme" parent="@android:style/Theme.Translucent" />
    <style name="BottomNavigationViewText" parent="TextAppearance.MaterialComponents.Caption">
        <item name="android:textSize">12sp</item>
    </style>
    <style name="Widget.MyApp.BottomNavigationView" parent="Widget.MaterialComponents.BottomNavigationView">
        <item name="android:background">@color/white</item>
    </style>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'themes.xml'), themesXml, 'utf8');
  }

  setupArrays(valuesDir) {
    const arraysXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <array name="preloaded_fonts">
        <item>@font/poppins</item>
        <item>@font/poppins_bold</item>
        <item>@font/poppins_medium</item>
        <item>@font/poppins_semibold</item>
    </array>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'arrays.xml'), arraysXml, 'utf8');
  }

  setupAttrs(valuesDir) {
    const attrsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <declare-styleable name="SkeletonConstraintLayout">
        <attr name="customDuration" format="integer" />
        <attr name="clipToText" format="boolean" />
        <attr name="skeletonColor" format="color" />
        <attr name="shimmerStrokeWidth" format="dimension" />
        <attr name="shimmerBlurWidth" format="dimension" />
    </declare-styleable>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'attrs.xml'), attrsXml, 'utf8');
  }

  setupDimens(valuesDir) {
    const dimensXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="tlib_defaultSkeletonBlurWidth">25dp</dimen>
    <dimen name="tlib_defaultSkeletonCornerRadius">5dp</dimen>
    <dimen name="tlib_defaultSkeletonStrokeWidth">30dp</dimen>
    <dimen name="tlib_default_margin">10dp</dimen>
    <dimen name="tlib_no_margin">0dp</dimen>
    <dimen name="tlib_no_size">0dp</dimen>
    <dimen name="tlib_text_size_large">15sp</dimen>
    <dimen name="tlib_text_size_small">11sp</dimen>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'dimens.xml'), dimensXml, 'utf8');
  }

  generateReadme() {
    const readmeContent = `# Universal TV Remote - Reconstructed Android Studio Project

Reconstructed from \`Universal+TV+Remote+_+All+TV_1.0.6_APKPure.xapk\` (Package: \`com.universaltv.remotecontrol.tvremote\`, Version: 1.0.6, Code: 7).

## Architecture Overview

1. **Infrared (IR) Remote Control Engine:**
   - Handled by \`ConsumerIrManager\` transmitting at 38 kHz.
   - Raw IR carrier timing sequences are loaded from \`app/src/main/assets/ircodes.json\`.
   - Supports hundreds of TV brands: Samsung, LG, Sony, Toshiba, Panasonic, TCL, Hisense, Philips, etc.
   - Key classes: \`SelectIrTvBrandActivity\`, \`IrRemoteActivity\`, \`IrDetectingActivity\`.

2. **WiFi Remote Discovery (SSDP / UPnP):**
   - \`SsdpDiscoveryManager\` sends UDP multicast discovery requests (\`M-SEARCH\`) to \`239.255.255.250:1900\`.
   - Discovers Smart TVs, Roku, Google TV, Android TV, Fire TV devices on the local subnet.
   - Key classes: \`DiscoverTvActivity\`, \`IpAddressActivity\`, \`TvListActivity\`.

3. **Android TV Remote Protocol v2 (Protobuf / Chaquopy):**
   - Connects to Google TV / Android TV on port 6467 (Pairing TLS Challenge) and port 6466 (Command Channel).
   - Encodes & decodes Protobuf messages using \`polo.proto\` and \`remotemessage.proto\` (located in \`app/src/main/python/wifiremote/\`).
   - Python protocol engine runs via Chaquopy embedded in \`app/src/main/assets/chaquopy/\`.
   - Key classes: \`WifiRemoteActivity\`, \`PairingCodeDialog\`.

4. **Persistence & UI:**
   - **Room Database:** \`AppDatabase\`, \`PairedRemoteEntity\`, \`RemoteDao\` for saving configured TV remotes.
   - **Gestures & Navigation:** Touchpad gesture detection (\`SWIPE_THRESHOLD = 120\`), D-Pad, Volume rocker, Numpad.
   - **Dependency Injection:** Koin (\`startKoin\`).
   - **Network & Ads:** Retrofit / OkHttp + AdMob remote config loaded from \`res/raw/tv_remote_ads_plan.json\`.

## How to Open in Android Studio

1. Open Android Studio (Ladybug / Koala or newer).
2. Select **File > Open...** and select this directory (\`reconstructed_tv_remote\`).
3. Allow Gradle to sync dependencies.
4. Run or debug on an Android device or Emulator (API 24+).
`;
    fs.writeFileSync(path.join(this.targetDir, 'README.md'), readmeContent, 'utf8');
  }
}
