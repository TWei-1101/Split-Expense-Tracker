import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBalances } from '../src/domain/calculateBalances.js';
import { calculateSettlements } from '../src/domain/calculateSettlements.js';

test('calculateBalances preserves shared expenses and excludes self-paid entries', () => {
  const balances = calculateBalances({
    members: ['a', 'b'],
    expenses: [
      { payerName: 'a', amountInTWD: 100, shares: { a: 1, b: 1 } },
      { payerName: '__self__', amountInTWD: 80, shares: { a: 1, b: 1 } },
      { payerName: 'b', amountInTWD: 60, shares: { a: 2, b: 1 } },
    ],
  });

  assert.deepEqual(balances, { a: 10, b: -10 });
});

test('calculateBalances ignores expenses with no shares', () => {
  assert.deepEqual(calculateBalances({
    members: ['a', 'b'],
    expenses: [{ payerName: 'a', amountInTWD: 100, shares: { a: 0, b: 0 } }],
  }), { a: 0, b: 0 });
});

test('calculateSettlements creates rounded transfers and ignores sub-dollar remainders', () => {
  assert.deepEqual(calculateSettlements({ a: 50.4, b: -20.2, c: -30.2 }), [
    { from: 'b', to: 'a', amount: 20 },
    { from: 'c', to: 'a', amount: 30 },
  ]);
});

test('BalanceSummary is separated from the application orchestrator', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../src/features/settlements/BalanceSummary.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /import BalanceSummary from '.\/features\/settlements\/BalanceSummary\.jsx'/);
  assert.match(componentSource, /待收退稅預估總額/);
  assert.match(componentSource, /所有帳目已結清/);
});

test('ConfirmationModal is separated as a reusable UI component', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../src/features/common/ConfirmationModal.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /import ConfirmationModal from '.\/features\/common\/ConfirmationModal\.jsx'/);
  assert.match(componentSource, /confirmColor === 'green'/);
  assert.match(componentSource, /onClick=\{onConfirm\}/);
});

test('MemberManagementModal is separated from the application orchestrator', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../src/features/members/MemberManagementModal.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /import MemberManagementModal from '.\/features\/members\/MemberManagementModal\.jsx'/);
  assert.match(componentSource, /管理分帳成員與預設份數/);
  assert.match(componentSource, /migrateMemberID\(oldName, newId, setModalMessage\)/);
});

test('AuthModal is separated from the application orchestrator', () => {
  const appSource = readFileSync(new URL('../src/App.real.jsx', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../src/features/auth/AuthModal.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /import AuthModal from '.\/features\/auth\/AuthModal\.jsx'/);
  assert.match(componentSource, /signInWithEmailAndPassword/);
  assert.match(componentSource, /createUserWithEmailAndPassword/);
});
