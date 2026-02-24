const MAX_FETCH_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryMethod = (method = 'GET') => {
  const value = String(method || 'GET').toUpperCase();
  return value === 'GET' || value === 'HEAD' || value === 'OPTIONS';
};

export const installFetchRetry = () => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__sscFetchRetryInstalled) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    if (!shouldRetryMethod(method)) {
      return nativeFetch(input, init);
    }
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_FETCH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok || (response.status < 500 || response.status >= 600) || attempt >= MAX_FETCH_RETRY_ATTEMPTS) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_FETCH_RETRY_ATTEMPTS) throw error;
      }
      await wait(RETRY_BASE_DELAY_MS * attempt);
    }
    throw lastError || new Error('Fetch failed');
  };
  window.__sscFetchRetryInstalled = true;
};

