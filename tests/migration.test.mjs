import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const json = p => JSON.parse(read(p));

test('custom installer geometry and animation are retained', () => {
  const window = json('installer-app/src-tauri/tauri.conf.json').app.windows[0];
  assert.equal(window.width,620); assert.equal(window.height,560);
  const app = read('installer-app/src/App.tsx');
  for(const screen of ['welcome','options','installing','finish']) assert.ok(app.includes(`"${screen}"`));
  assert.ok(app.includes('screenVariants'));
});
test('updater uses v2 signature pipeline and existing concurrency control', () => {
  const updater = read('src-tauri/src/updater.rs');
  for(const fragment of ['CHECK_LOCK.lock().await','UPDATE_BUSY.swap','download_and_install','is_installed_copy','install_needs_unavailable_elevation','ensure_update_configuration']) assert.ok(updater.includes(fragment),fragment);
  assert.ok(!updater.includes('RELEASES_API'));
  const cfg=json('src-tauri/tauri.conf.json');
  assert.deepEqual(cfg.plugins.updater.endpoints,['https://github.com/panchi146/Oryvia/releases/latest/download/latest.json']);
  assert.equal(cfg.plugins.updater.pubkey,'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzODBEQTkyODBCMUYwRjkKUldUNThMR0FrdHFBTTkvQ0lyRWJ5WW4wUVY4cWZIOXNHRUJoV2hIOGhic2ZjbENwQTlrV2M0dUcK');
  assert.equal(cfg.bundle.windows.allowDowngrades,false);
  assert.equal(cfg.bundle.createUpdaterArtifacts,true);
});
test('updater configuration policy validates valid endpoints and rejects unconfigured or invalid fixtures', () => {
  const isValidConfig = (updater) => {
    if (!updater) return false;
    const key = (updater.pubkey || '').trim();
    const endpoints = updater.endpoints;
    if (!key || !Array.isArray(endpoints) || endpoints.length === 0) return false;
    return endpoints.every(url => typeof url === 'string' && url.startsWith('https://') && !url.toLowerCase().includes('kua8/nectar'));
  };

  // 1. Unconfigured fixtures (empty endpoints / empty pubkey)
  const unconfiguredFixture = { endpoints: [], pubkey: '' };
  assert.equal(isValidConfig(unconfiguredFixture), false, 'Unconfigured fixture must be rejected');
  assert.equal(isValidConfig({ endpoints: ['https://test.invalid/updates'], pubkey: '' }), false, 'Empty pubkey must be rejected');
  assert.equal(isValidConfig({ endpoints: [], pubkey: 'some-key' }), false, 'Empty endpoints must be rejected');

  // 2. Invalid fixtures (insecure HTTP or upstream Nectar URLs)
  const httpFixture = { endpoints: ['http://github.com/panchi146/Oryvia/releases/latest/download/latest.json'], pubkey: 'valid-key' };
  assert.equal(isValidConfig(httpFixture), false, 'HTTP endpoint must be rejected');
  const upstreamFixture = { endpoints: ['https://github.com/kua8/Nectar/releases/latest/download/latest.json'], pubkey: 'valid-key' };
  assert.equal(isValidConfig(upstreamFixture), false, 'Upstream Nectar endpoint must be rejected');

  // 3. Current production configuration fixture
  const cfg = json('src-tauri/tauri.conf.json');
  assert.equal(isValidConfig(cfg.plugins.updater), true, 'Production updater configuration must be valid and secure');
});
test('uninstall paths share conservative file deletion and have no recursive fallback', () => {
  for(const file of ['installer-app/src-tauri/src/uninstall.rs','src-tauri/src/native_uninstall.rs']) {
    const s=read(file);
    assert.ok(s.includes('install_safety::remove_app_files_command'));
    for(const forbidden of ['-Recurse','rd /s','cmd /c','IMAGENAME eq','/IM']) assert.ok(!s.includes(forbidden),`${file}: ${forbidden}`);
  }
  const shared=read('install_safety.rs').split('#[cfg(test)]')[0] + read('installer/build/cleanup.ps1');
  assert.ok(!shared.includes('contains("nectar")'));
  assert.ok(shared.includes('ReparsePoint'));
  assert.ok(shared.includes('PSIsContainer'));
});
test('NSIS does not restore a stale uninstaller from shared TEMP', () => {
  const hooks=read('installer/build/installer.nsh');
  assert.ok(!hooks.includes('nectar-uninstall.keep'));
  assert.ok(!hooks.includes('${GetSize}'));
  assert.ok(hooks.includes('${MAINBINARYNAME}.exe$\\" --uninstall'));
  assert.ok(hooks.includes('QuietUninstallString'));
  const registry=read('installer-app/src-tauri/src/registry.rs');
  const native=read('src-tauri/src/uninstall_registry.rs');
  const customKey=registry.match(/Uninstall\\([^"\n]+)/)[1];
  const nativeKey=native.match(/Uninstall\\([^"\n]+)/)[1];
  assert.equal(customKey,nativeKey);
  assert.equal(customKey.toLowerCase(),json('src-tauri/tauri.conf.json').productName.toLowerCase());
});
test('payload is limited to the single owned executable', () => {
  const source=read('installer-app/src-tauri/src/payload.rs');
  assert.ok(source.includes('archive.len() != 1'));
  assert.ok(source.includes('entry.unix_mode()'));
  assert.ok(source.includes('validate_dir(dest)'));
});
test('release preparation cannot publish or delete existing releases', () => {
  const release=read('scripts/release.ps1');
  for(const forbidden of ['git push','gh release','Remove-Item $out -Recurse']) assert.ok(!release.includes(forbidden));
  assert.ok(release.includes('SHA256SUMS.txt'));
  assert.ok(release.includes('Copy-Item "$setup.sig" $out'));
  assert.ok(!read('.github/workflows/release.yml').includes('contents: write'));
});

test('custom UI and settings implementation match the supplied baseline', () => {
  const baseline=json('migration/baseline-sha256.json');
  // Settings update-state handling is deliberately changed in the audit fixes;
  // its behavior is covered by updater-local.test.mjs rather than a stale hash.
  for(const name of ['src/App.tsx','src/App.css','src/Overlay.css','src/theme.ts','installer-app/src/App.css']) {
    const expected=baseline.find(entry=>entry.path===name);
    assert.ok(expected,name);
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
    assert.equal(actual,expected.sha256,name);
  }
  const overlayExpected=baseline.find(entry=>entry.path==='src/Overlay.tsx');
  assert.ok(overlayExpected,'src/Overlay.tsx');
  const overlayRaw=fs.readFileSync(path.join(root,'src/Overlay.tsx'),'utf8');
  assert.equal(
    crypto.createHash('sha256').update(overlayRaw,'utf8').digest('hex'),
    '686a89530aa06e4f08ad706f50834ec9a299b0cfff85c23b65afc8945513abc1',
    'src/Overlay.tsx branded hash'
  );
  const overlayNormalized=overlayRaw
    .replace('              src="/oryvia.png"\r\n              alt="Oryvia"', '              src="/nectar.png"')
    .replace('<img src="/oryvia.png" className="update-splash-logo" alt="Oryvia" />', '<img src="/nectar.png" className="update-splash-logo" alt="Nectar" />');
  assert.equal(
    crypto.createHash('sha256').update(overlayNormalized,'utf8').digest('hex'),
    overlayExpected.sha256,
    'src/Overlay.tsx matches baseline outside the two splash logo branding lines'
  );
});

test('Oryvia versions and identifiers agree across app and installer', () => {
  for(const file of ['package.json','installer-app/package.json','src-tauri/tauri.conf.json','installer-app/src-tauri/tauri.conf.json']) assert.equal(json(file).version,'1.0.0',file);
  assert.equal(json('src-tauri/tauri.conf.json').identifier,'com.panchi146.oryvia');
  assert.equal(json('installer-app/src-tauri/tauri.conf.json').identifier,'com.panchi146.oryvia.installer');
  for(const prefix of ['src-tauri','installer-app/src-tauri']) assert.match(read(`${prefix}/Cargo.toml`),/^version = "1\.0\.0"$/m);
  assert.match(read('install_safety.rs'),/APP_FILES[^\n]+"oryvia\.exe"/);
});
