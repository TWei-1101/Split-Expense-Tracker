import { useEffect, useMemo, useState } from 'react';

export const PERMANENT_RATES_CACHE_KEY = 'permanentExchangeRates';
export const EXCHANGE_RATES_CACHE_KEY = 'exchangeRatesCache';
export const EXCHANGE_RATES_CACHE_TIME_KEY = 'exchangeRatesCacheTime';
export const LAST_CONVERTER_SOURCE_CURRENCY_KEY = 'lastConverterSourceCurrency';
export const DEFAULT_CURRENCY = 'TWD';
export const FOUR_HOURS = 4 * 60 * 60 * 1000;

export const HARDCODED_DEFAULT_RATES = {
  TWD: 1.0,
  CNY: 4.5,
  HKD: 3.9,
  USD: 30.5,
  THB: 0.85,
  EUR: 33.0,
  CAD: 22.5,
  VND: 0.0013,
  IDR: 0.002,
  JPY: 0.25,
  KRW: 0.023,
  AUD: 20.0,
  NOK: 2.9,
};

export const CURRENCIES = Object.keys(HARDCODED_DEFAULT_RATES);

const getStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

export function getPersistedExchangeRates(storage = getStorage()) {
  try {
    const cachedRates = storage?.getItem(PERMANENT_RATES_CACHE_KEY);
    return cachedRates ? JSON.parse(cachedRates) : HARDCODED_DEFAULT_RATES;
  } catch (error) {
    console.warn('⚠ 讀取持久化匯率快取失敗，使用硬編碼預設值。', error);
    return HARDCODED_DEFAULT_RATES;
  }
}

export function getCachedExchangeRates(storage = getStorage(), now = Date.now()) {
  try {
    const cachedRates = storage?.getItem(EXCHANGE_RATES_CACHE_KEY);
    const cachedTime = storage?.getItem(EXCHANGE_RATES_CACHE_TIME_KEY);
    const lastUpdate = Number.parseInt(cachedTime, 10);

    if (cachedRates && Number.isFinite(lastUpdate) && now - lastUpdate < FOUR_HOURS) {
      return { rates: JSON.parse(cachedRates), lastUpdate };
    }
  } catch (error) {
    console.warn('⚠ 讀取臨時匯率快取失敗，將重新抓取。', error);
  }

  return null;
}

export function processExchangeRates(apiRates, fallbackRates) {
  return CURRENCIES.reduce((rates, code) => {
    if (code === DEFAULT_CURRENCY) return rates;
    const rateTWDToCode = apiRates?.[code];
    rates[code] = typeof rateTWDToCode === 'number' && rateTWDToCode > 0
      ? 1 / rateTWDToCode
      : fallbackRates[code];
    return rates;
  }, { [DEFAULT_CURRENCY]: 1.0 });
}

export async function fetchExchangeRates({ storage = getStorage(), now = () => Date.now(), fetcher = fetch } = {}) {
  const cached = getCachedExchangeRates(storage, now());
  if (cached) return cached;

  const fallbackRates = getPersistedExchangeRates(storage);
  try {
    const response = await fetcher('https://open.er-api.com/v6/latest/TWD');
    if (!response.ok) throw new Error('API 回應錯誤');

    const data = await response.json();
    if (!data || data.result !== 'success') throw new Error('無效匯率資料');

    const rates = processExchangeRates(data.rates, fallbackRates);
    const lastUpdate = now();
    try {
      storage?.setItem(EXCHANGE_RATES_CACHE_KEY, JSON.stringify(rates));
      storage?.setItem(EXCHANGE_RATES_CACHE_TIME_KEY, String(lastUpdate));
      storage?.setItem(PERMANENT_RATES_CACHE_KEY, JSON.stringify(rates));
    } catch (error) {
      console.warn('⚠️ 無法寫入匯率快取（可能是無痕模式）', error);
    }
    return { rates, lastUpdate };
  } catch (error) {
    console.error('❌ 抓取匯率失敗，使用預設匯率', error);
    return { rates: fallbackRates, lastUpdate: now() };
  }
}

export function calculateConvertedAmount({ amount, sourceCurrency, targetCurrency, rates, fallbackRates = HARDCODED_DEFAULT_RATES }) {
  const numericAmount = Number.parseFloat(amount) || 0;
  if (numericAmount <= 0) return 0;

  const rateToTWD = rates[sourceCurrency] || fallbackRates[sourceCurrency] || 1;
  const rateToTarget = rates[targetCurrency] || fallbackRates[targetCurrency] || 1;
  if (rateToTarget === 0) return 0;
  return Number.parseFloat(((numericAmount * rateToTWD) / rateToTarget).toFixed(2));
}

export default function useExchangeRates() {
  const [liveExchangeRates, setLiveExchangeRates] = useState(() => getPersistedExchangeRates());
  const [lastExchangeUpdate, setLastExchangeUpdate] = useState(null);
  const [converterSourceCurrency, setConverterSourceCurrency] = useState(
    () => getStorage()?.getItem(LAST_CONVERTER_SOURCE_CURRENCY_KEY) || DEFAULT_CURRENCY,
  );
  const [converterTargetCurrency, setConverterTargetCurrency] = useState(DEFAULT_CURRENCY);
  const [converterAmount, setConverterAmount] = useState('');

  useEffect(() => {
    fetchExchangeRates().then(({ rates, lastUpdate }) => {
      setLiveExchangeRates(rates);
      setLastExchangeUpdate(lastUpdate);
    });
  }, []);

  useEffect(() => {
    try {
      getStorage()?.setItem(LAST_CONVERTER_SOURCE_CURRENCY_KEY, converterSourceCurrency);
    } catch (error) {
      console.warn('⚠ 無法記錄上次使用的換算幣別。', error);
    }
  }, [converterSourceCurrency]);

  const convertedAmount = useMemo(
    () => calculateConvertedAmount({
      amount: converterAmount,
      sourceCurrency: converterSourceCurrency,
      targetCurrency: converterTargetCurrency,
      rates: liveExchangeRates,
    }),
    [converterAmount, converterSourceCurrency, converterTargetCurrency, liveExchangeRates],
  );

  return {
    currencies: CURRENCIES,
    fallbackExchangeRates: HARDCODED_DEFAULT_RATES,
    liveExchangeRates,
    lastExchangeUpdate,
    converterSourceCurrency,
    setConverterSourceCurrency,
    converterTargetCurrency,
    setConverterTargetCurrency,
    converterAmount,
    setConverterAmount,
    convertedAmount,
  };
}
