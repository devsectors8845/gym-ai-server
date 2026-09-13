jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })), getApps: jest.fn(() => []), getApp: jest.fn(), cert: jest.fn(value => value),
}));
jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn(() => ({ collection: jest.fn() })) }));
const savedAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const savedVercel = process.env.VERCEL;
afterEach(() => {
  if (savedAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT; else process.env.FIREBASE_SERVICE_ACCOUNT = savedAccount;
  if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
  jest.resetModules();
});
it('initializes credentials even when a repository is imported first', () => {
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project', client_email: 'test@example.com', private_key: 'line1\\nline2' });
  const repositoryAdmin = require('../../functions/src/firestore/admin');
  const serverAdmin = require('../firebaseAdmin');
  const { initializeApp, cert } = require('firebase-admin/app');
  expect(cert).toHaveBeenCalledWith({ projectId: 'test-project', clientEmail: 'test@example.com', privateKey: 'line1\nline2' });
  expect(initializeApp).toHaveBeenCalledTimes(1);
  expect(repositoryAdmin.db).toBe(serverAdmin.db);
});
it('fails clearly when Vercel credentials are missing', () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.VERCEL = '1';
  expect(() => require('../firebaseAdmin')).toThrow('FIREBASE_SERVICE_ACCOUNT must be configured');
});
it('does not disclose malformed credentials', () => {
  process.env.FIREBASE_SERVICE_ACCOUNT = 'private-secret-value';
  expect(() => require('../firebaseAdmin')).toThrow('FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.');
});
