import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/updater.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const policy=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('unconfigured manual/background results and errors always leave loading state',()=>{
  assert.equal(policy.statusFromUpdateResult({available:false,configured:false}),'unconfigured');
  assert.equal(policy.statusFromUpdateError('updater_not_configured'),'unconfigured');
  for(const status of ['checking','downloading','installing'])assert.equal(policy.finishUpdateActivity(status),'idle');
  assert.equal(policy.finishUpdateActivity('unconfigured'),'unconfigured');
  assert.equal(policy.statusFromUpdateError('network error'),'error');
  assert.equal(policy.statusFromUpdateResult({available:true,version:'1.0.1'}),'available');
});

test('local-only updater and native scheduling messages have both Vietnamese and English',()=>{
  const text=fs.readFileSync(new URL('../src/i18n/translations.ts',import.meta.url),'utf8');
  assert.equal((text.match(/"settings\.about\.update\.unconfigured":/g)||[]).length,2);
  const messages=JSON.parse(fs.readFileSync(new URL('../src/i18n/native-uninstall.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(messages.en),Object.keys(messages.vi));
  for(const key of Object.keys(messages.en))assert.ok(messages.en[key]&&messages.vi[key]);
});
