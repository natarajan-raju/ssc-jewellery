const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const normalizePrivateKey = (value = '') => String(value || '').replace(/\\n/g, '\n');

const loadServiceAccountFromEnv = () => {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    if (parsed?.private_key) {
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    }
    return parsed;
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey
    };
  }

  return null;
};

const loadServiceAccountFromPath = () => {
  const configuredPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (!configuredPath) return null;

  const resolvedPath = path.resolve(configuredPath);
  const rawJson = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(rawJson);

  if (parsed?.private_key) {
    parsed.private_key = normalizePrivateKey(parsed.private_key);
  }

  return parsed;
};

const loadServiceAccount = () => {
  const fromEnv = loadServiceAccountFromEnv();
  if (fromEnv) return fromEnv;
  const fromPath = loadServiceAccountFromPath();
  if (fromPath) return fromPath;
  return require('../service-account.json');
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount())
  });
}

module.exports = admin;
