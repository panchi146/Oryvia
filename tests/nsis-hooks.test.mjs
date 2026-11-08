import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const compiler = [process.env.ORYVIA_MAKENSIS, join(process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe'), join(process.env.USERPROFILE ?? '', 'AppData', 'Local', 'tauri', 'NSIS', 'makensis.exe')].find(p => p && existsSync(p));
test('NSIS production hooks compile in isolated fixture', {skip: !compiler}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'oryvia-nsis-fixture-'));
  const output = join(dir, 'hooks.exe');
  try {
    const result = spawnSync(compiler, ['/V2', `/DORYVIA_FIXTURE_OUTPUT=${output}`, fileURLToPath(new URL('./nsis-hooks-fixture.nsi', import.meta.url))], {encoding:'utf8', windowsHide:true, timeout:60000});
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
    assert.ok(existsSync(output));
  } finally {
    if (existsSync(output)) unlinkSync(output);
    rmdirSync(dir);
  }
});
