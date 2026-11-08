import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Windows fixture: owned registry/startup, locked files and retry behavior',{skip:process.platform!=='win32'},()=>{
  const script=fileURLToPath(new URL('./install-safety.test.ps1',import.meta.url));
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',timeout:60000,windowsHide:true});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}\n${result.error??''}`);
  assert.match(result.stdout,/\d+ behavior tests passed/);
});
