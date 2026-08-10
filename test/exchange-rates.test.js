import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateConvertedAmount,
  getCachedExchangeRates,
  processExchangeRates,
} from '../src/hooks/useExchangeRates.js';

test('uses a fresh cached exchange-rate snapshot without fetching', () => {
  const storage = new Map([
    ['exchangeRatesCache', JSON.stringify({ TWD: 1, JPY: 0.25 })],
    ['exchangeRatesCacheTime', '1000'],
  ]);
  storage.getItem = storage.get.bind(storage);

  assert.deepEqual(getCachedExchangeRates(storage, 2000), {
    rates: { TWD: 1, JPY: 0.25 },
    lastUpdate: 1000,
  });
});

test('converts API TWD base rates into the app TWD-per-currency format', () => {
  const rates = processExchangeRates(
    { TWD: 1, JPY: 4, USD: 0.03 },
    { TWD: 1, CNY: 4.5, HKD: 3.9, USD: 30.5, THB: 0.85, EUR: 33, CAD: 22.5, VND: 0.0013, IDR: 0.002, JPY: 0.25, KRW: 0.023, AUD: 20, NOK: 2.9 },
  );

  assert.equal(rates.TWD, 1);
  assert.equal(rates.JPY, 0.25);
  assert.equal(rates.USD, 33.333333333333336);
  assert.equal(rates.THB, 0.85);
});

test('converts through TWD and retains two decimal places', () => {
  assert.equal(calculateConvertedAmount({ amount: '100', sourceCurrency: 'JPY', targetCurrency: 'USD', rates: { JPY: 0.25, USD: 25 } }), 1);
  assert.equal(calculateConvertedAmount({ amount: '0', sourceCurrency: 'JPY', targetCurrency: 'USD', rates: {} }), 0);
});
