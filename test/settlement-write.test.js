import test from 'node:test';
import assert from 'node:assert/strict';
import { commitSettlementOnce } from '../src/lib/settlement-write.js';

function database() {
  const data = new Map([['expenses/bill', { payerName: 'A', amountInTWD: 100, shares: { A: 1, B: 1 } }]]);
  const ref = path => ({ path, id: path.split('/').at(-1) });
  const snapshot = r => {
    const value = structuredClone(data.get(r.path));
    return { ref: r, exists: () => value !== undefined, data: () => value };
  };
  let queue = Promise.resolve();
  const transact = callback => {
    const next = queue.then(async () => {
      const writes = [];
      const result = await callback({ get: async r => snapshot(r), set: (r, value) => writes.push([r.path, value]) });
      writes.forEach(([path, value]) => data.set(path, value));
      return result;
    });
    queue = next.catch(() => {});
    return next;
  };
  const options = operationId => ({
    request: { operationId, from: 'B', to: 'A', amount: 50, expense: { creatorId: 'B' } },
    members: ['A', 'B'], stateRef: ref('settings/state'),
    operationRef: ref(`settings/op-${operationId}`), expenseRef: ref(`expenses/settlement-${operationId}`),
    readState: async () => snapshot(ref('settings/state')),
    readExpenses: async () => ({ docs: [...data.keys()].filter(path => path.startsWith('expenses/')).map(path => snapshot(ref(path))) }),
    transact, timestamp: () => 123,
  });
  const repayments = () => [...data.values()].filter(item => item.kind === 'settlement');
  return { data, options, repayments };
}

test('same operation repeated creates exactly one repayment', async () => {
  const db = database();
  assert.deepEqual(await commitSettlementOnce(db.options('one')), { created: true });
  assert.deepEqual(await commitSettlementOnce(db.options('one')), { created: false });
  assert.equal(db.repayments().length, 1);
});

test('two devices settling the same balance concurrently cannot both commit', async () => {
  const db = database();
  const results = await Promise.allSettled([commitSettlementOnce(db.options('device1')), commitSettlementOnce(db.options('device2'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(db.repayments().length, 1);
  assert.equal(db.data.get('settings/state').revision, 1);
});

test('a stale button after another operation completed does not create repayment', async () => {
  const db = database();
  await commitSettlementOnce(db.options('first'));
  await assert.rejects(commitSettlementOnce(db.options('stale')), /已更新/);
  assert.equal(db.repayments().length, 1);
});

test('later legitimate debt of the same amount can be settled', async () => {
  const db = database();
  await commitSettlementOnce(db.options('first'));
  db.data.set('expenses/new-bill', { payerName: 'A', amountInTWD: 100, shares: { A: 1, B: 1 } });
  await commitSettlementOnce(db.options('second'));
  assert.equal(db.repayments().length, 2);
});

test('expense edit during confirmation aborts all writes', async () => {
  const db = database();
  const options = db.options('edit');
  const original = options.transact;
  options.transact = callback => {
    db.data.set('expenses/bill', { payerName: 'A', amountInTWD: 200, shares: { A: 1, B: 1 } });
    return original(callback);
  };
  await assert.rejects(commitSettlementOnce(options), /資料已變更/);
  assert.equal(db.repayments().length, 0);
  assert.equal(db.data.has('settings/op-edit'), false);
});

test('retry after lost acknowledgement does not create a second repayment', async () => {
  const db = database();
  const options = db.options('retry');
  const original = options.transact;
  options.transact = async callback => { await original(callback); throw Error('connection lost'); };
  await assert.rejects(commitSettlementOnce(options), /connection lost/);
  assert.deepEqual(await commitSettlementOnce(db.options('retry')), { created: false });
  assert.equal(db.repayments().length, 1);
});

test('server read failure never writes a repayment', async () => {
  const db = database();
  await assert.rejects(commitSettlementOnce({ ...db.options('offline'), readExpenses: async () => { throw Error('offline'); } }), /offline/);
  assert.equal(db.repayments().length, 0);
});

test('invalid transfers are rejected before any write', async () => {
  const db = database();
  for (const amount of [NaN, Infinity, 0, -1, .5]) {
    const options = db.options('invalid');
    options.request.amount = amount;
    await assert.rejects(commitSettlementOnce(options), /無效/);
  }
  assert.equal(db.repayments().length, 0);
});
