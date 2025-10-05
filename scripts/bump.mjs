// scripts/bump.mjs
import fs from 'fs';
import path from 'path';

const KIND = (process.argv[2] || 'patch').toLowerCase(); // 'patch' | 'minor' | 'major'
const ROOT = process.cwd();

const appJsonPath = path.join(ROOT, 'app.json');
const gradlePath = path.join(ROOT, 'android', 'app', 'build.gradle');

function bumpSemver(v, kind) {
  const [maj=0, min=0, pat=0] = String(v||'0.0.0').split('.').map(n => parseInt(n,10)||0);
  if (kind === 'major') return `${maj+1}.0.0`;
  if (kind === 'minor') return `${maj}.${min+1}.0`;
  return `${maj}.${min}.${pat+1}`; // patch
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

let version, versionCode;

// 1) app.json
if (fs.existsSync(appJsonPath)) {
  const app = readJSON(appJsonPath);
  app.expo = app.expo || {};
  version = bumpSemver(app.expo.version, KIND);
  app.expo.version = version;

  app.expo.android = app.expo.android || {};
  versionCode = (app.expo.android.versionCode || 0) + 1;
  app.expo.android.versionCode = versionCode;

  // optional: keep iOS buildNumber in step with version
  if (app.expo.ios) {
    // if numeric buildNumber, bump it; else leave as-is
    const bn = app.expo.ios.buildNumber;
    if (bn && /^\d+$/.test(String(bn))) {
      app.expo.ios.buildNumber = String(parseInt(bn,10) + 1);
    }
  }

  writeJSON(appJsonPath, app);
} else {
  console.error('app.json not found; skipping JSON bump.');
}

// 2) android/app/build.gradle
if (fs.existsSync(gradlePath) && version && versionCode) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle
    .replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`)
    .replace(/versionName\s+["'][^"']+["']/g, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, gradle);
} else {
  console.warn('build.gradle not updated (file missing or no version info).');
}

console.log(`Bumped: version=${version}  versionCode=${versionCode}`);
