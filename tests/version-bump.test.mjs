import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('version bumper updates both Cargo locks with CRLF input in an isolated fixture',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'oryvia-version-test-'));
  const inputs=['package.json','package-lock.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json','installer-app/package.json','installer-app/package-lock.json','installer-app/src-tauri/Cargo.toml','installer-app/src-tauri/Cargo.lock','installer-app/src-tauri/tauri.conf.json','scripts/bump-version.mjs'];
  try {
    for(const name of inputs) {
      const target=path.join(temp,name);fs.mkdirSync(path.dirname(target),{recursive:true});
      let data=fs.readFileSync(path.join(root,name),'utf8');
      if(name.endsWith('Cargo.lock'))data=data.replace(/\r?\n/g,'\r\n');
      fs.writeFileSync(target,data);
    }
    const result=spawnSync(process.execPath,[path.join(temp,'scripts/bump-version.mjs'),'1.0.1'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    for(const [prefix,pkg] of [['src-tauri','oryvia'],['installer-app/src-tauri','oryvia-installer']]) {
      const lock=fs.readFileSync(path.join(temp,prefix,'Cargo.lock'),'utf8');
      assert.ok(lock.includes(`name = "${pkg}"\nversion = "1.0.1"`));
    }
    for(const name of ['package.json','installer-app/package.json','src-tauri/tauri.conf.json','installer-app/src-tauri/tauri.conf.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(temp,name),'utf8')).version,'1.0.1');
  } finally {
    // Delete only the exact files and now-empty directories this fixture created.
    for(const name of inputs)fs.unlinkSync(path.join(temp,name));
    for(const dir of ['scripts','src-tauri','installer-app/src-tauri','installer-app'])fs.rmdirSync(path.join(temp,dir));
    fs.rmdirSync(temp);
  }
});
