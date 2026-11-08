import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseMinisignPublicKey(pubkeyBase64) {
  let pubRawText = pubkeyBase64;
  if (!pubkeyBase64.includes('\n')) {
    pubRawText = Buffer.from(pubkeyBase64.trim(), 'base64').toString('utf8');
  }
  const lines = pubRawText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('Invalid minisign public key format: missing key line');
  }
  const pubBytes = Buffer.from(lines[1].trim(), 'base64');
  if (pubBytes.length !== 42) {
    throw new Error(`Invalid minisign public key length: expected 42 bytes, got ${pubBytes.length}`);
  }
  const keyId = pubBytes.subarray(2, 10).toString('hex').toUpperCase();
  const rawEd25519Key = pubBytes.subarray(10);
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const spkiKey = Buffer.concat([spkiPrefix, rawEd25519Key]);
  const publicKey = crypto.createPublicKey({ key: spkiKey, format: 'der', type: 'spki' });
  return { keyId, publicKey, rawEd25519Key };
}

export function parseMinisignSignature(sigRaw) {
  let sigText = (typeof sigRaw === 'string' ? sigRaw : sigRaw.toString('utf8')).trim();
  // Tauri CLI v2 stores the entire minisign 4-line signature as a single base64 string
  if (!sigText.startsWith('untrusted comment:') && !sigText.includes('\n')) {
    try {
      const decoded = Buffer.from(sigText, 'base64').toString('utf8');
      if (decoded.includes('untrusted comment:')) {
        sigText = decoded.trim();
      }
    } catch {
      // not base64 wrapped
    }
  }

  const lines = sigText.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('Invalid minisign signature format: fewer than 2 lines');
  }

  const bin1 = Buffer.from(lines[1].trim(), 'base64');
  if (bin1.length !== 74) {
    throw new Error(`Invalid signature bin1 length: expected 74 bytes, got ${bin1.length}`);
  }

  const sigAlg = bin1.subarray(0, 2).toString('utf8');
  const sigKeyId = bin1.subarray(2, 10).toString('hex').toUpperCase();
  const rawSig = bin1.subarray(10, 74);

  let trustedComment = null;
  let globalSig = null;
  if (lines.length >= 4 && lines[2].startsWith('trusted comment:')) {
    trustedComment = lines[2];
    const bin2 = Buffer.from(lines[3].trim(), 'base64');
    if (bin2.length === 64) {
      globalSig = bin2;
    }
  }

  return { sigAlg, sigKeyId, rawSig, trustedComment, globalSig };
}

export function verifyMinisign(fileBuffer, sigInput, pubkeyBase64) {
  const { keyId, publicKey } = parseMinisignPublicKey(pubkeyBase64);
  const { sigAlg, sigKeyId, rawSig, trustedComment, globalSig } = parseMinisignSignature(sigInput);

  if (keyId !== sigKeyId) {
    throw new Error(`Key ID mismatch: public key has ${keyId}, signature has ${sigKeyId}`);
  }

  let dataToVerify = fileBuffer;
  if (sigAlg === 'ED') {
    // Prehashed Ed25519 with BLAKE2b-512
    dataToVerify = crypto.createHash('blake2b512').update(fileBuffer).digest();
  } else if (sigAlg !== 'Ed') {
    throw new Error(`Unsupported minisign algorithm: ${sigAlg}`);
  }

  const fileSigValid = crypto.verify(null, dataToVerify, publicKey, rawSig);
  if (!fileSigValid) {
    return { valid: false, reason: 'File content signature verification failed', keyId, algorithm: sigAlg };
  }

  if (trustedComment && globalSig) {
    const commentContent = trustedComment.startsWith('trusted comment: ')
      ? trustedComment.substring(17)
      : trustedComment;
    const commentData = Buffer.concat([rawSig, Buffer.from(commentContent, 'utf8')]);
    const commentSigValid = crypto.verify(null, commentData, publicKey, globalSig);
    if (!commentSigValid) {
      return { valid: false, reason: 'Trusted comment signature verification failed', keyId, algorithm: sigAlg };
    }
  }

  return { valid: true, keyId, algorithm: sigAlg };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const filePath = process.argv[2];
  const sigPath = process.argv[3];
  if (!filePath || !sigPath) {
    console.error('Usage: node scripts/verify-signature.mjs <filePath> <sigPath>');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`Target file does not exist: ${filePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(sigPath)) {
    console.error(`Signature file does not exist: ${sigPath}`);
    process.exit(1);
  }

  const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const pubkey = tauriConf.plugins?.updater?.pubkey;
  if (!pubkey) {
    console.error('No public key configured in src-tauri/tauri.conf.json');
    process.exit(1);
  }

  const fileBuf = fs.readFileSync(filePath);
  const sigContent = fs.readFileSync(sigPath, 'utf8');

  try {
    const res = verifyMinisign(fileBuf, sigContent, pubkey);
    if (res.valid) {
      console.log(`PASS: Signature in ${path.basename(sigPath)} verified with Key ID ${res.keyId} (algorithm: ${res.algorithm})`);
      process.exit(0);
    } else {
      console.error(`FAIL: Signature verification failed for ${path.basename(filePath)}: ${res.reason}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`FAIL: Signature verification exception: ${err.message}`);
    process.exit(1);
  }
}
