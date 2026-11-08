import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyMinisign } from '../scripts/verify-signature.mjs';

function createMinisignFixture(isPrehashed = false, customKeyIdHex = null) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  const keyIdHex = customKeyIdHex || crypto.randomBytes(8).toString('hex');
  const keyId = Buffer.from(keyIdHex, 'hex');
  const keyIdUpper = keyIdHex.toUpperCase();
  const pubBytes = Buffer.concat([Buffer.from('Ed', 'utf8'), keyId, rawPub]);
  const pubB64 = Buffer.from(`untrusted comment: minisign public key: ${keyIdUpper}\n` + pubBytes.toString('base64')).toString('base64');

  const fileData = Buffer.from('Oryvia NSIS Release Installer Executable Content');
  const alg = isPrehashed ? 'ED' : 'Ed';
  const dataToSign = isPrehashed ? crypto.createHash('blake2b512').update(fileData).digest() : fileData;
  const sig = crypto.sign(null, dataToSign, privateKey);
  const bin1 = Buffer.concat([Buffer.from(alg, 'utf8'), keyId, sig]);

  const trustedComment = 'trusted comment: timestamp:1700000000\tfile:Oryvia_1.0.0_x64-setup.exe';
  const trustedCommentContent = trustedComment.substring(17);
  const globalSig = crypto.sign(null, Buffer.concat([sig, Buffer.from(trustedCommentContent, 'utf8')]), privateKey);

  const rawSigText = [
    'untrusted comment: signature from minisign secret key',
    bin1.toString('base64'),
    trustedComment,
    globalSig.toString('base64')
  ].join('\n');

  const base64WrappedSigText = Buffer.from(rawSigText, 'utf8').toString('base64');

  return { fileData, pubB64, rawSigText, base64WrappedSigText, keyId: keyIdUpper, alg };
}

test('signature verification: valid unhashed signature raw and base64-wrapped', () => {
  const f = createMinisignFixture(false);
  const resRaw = verifyMinisign(f.fileData, f.rawSigText, f.pubB64);
  assert.equal(resRaw.valid, true);
  assert.equal(resRaw.keyId, f.keyId);
  assert.equal(resRaw.algorithm, 'Ed');

  const resWrapped = verifyMinisign(f.fileData, f.base64WrappedSigText, f.pubB64);
  assert.equal(resWrapped.valid, true);
  assert.equal(resWrapped.keyId, f.keyId);
  assert.equal(resWrapped.algorithm, 'Ed');
});

test('signature verification: valid prehashed signature raw and base64-wrapped', () => {
  const f = createMinisignFixture(true);
  const resRaw = verifyMinisign(f.fileData, f.rawSigText, f.pubB64);
  assert.equal(resRaw.valid, true);
  assert.equal(resRaw.keyId, f.keyId);
  assert.equal(resRaw.algorithm, 'ED');

  const resWrapped = verifyMinisign(f.fileData, f.base64WrappedSigText, f.pubB64);
  assert.equal(resWrapped.valid, true);
  assert.equal(resWrapped.keyId, f.keyId);
  assert.equal(resWrapped.algorithm, 'ED');
});

test('signature verification: tampered file is rejected', () => {
  const f = createMinisignFixture(false);
  const tamperedData = Buffer.from('Corrupted or modified payload');
  const res = verifyMinisign(tamperedData, f.base64WrappedSigText, f.pubB64);
  assert.equal(res.valid, false);
  assert.match(res.reason, /File content signature verification failed/);
});

test('signature verification: wrong public key throws Key ID mismatch', () => {
  const f1 = createMinisignFixture(false);
  const f2 = createMinisignFixture(false);
  assert.throws(() => {
    verifyMinisign(f1.fileData, f1.base64WrappedSigText, f2.pubB64);
  }, /Key ID mismatch/);
});
