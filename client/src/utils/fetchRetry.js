const MAX_FETCH_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const installFetchRetry = () => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__sscFetchRetryInstalled) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const retryFlag = init?.sscRetry;
    const shouldRetry = retryFlag === false ? false : true;
    if (!shouldRetry) {
      return nativeFetch(input, init);
    }
    const requestInit = Object.prototype.hasOwnProperty.call(init || {}, 'sscRetry')
      ? Object.fromEntries(Object.entries(init || {}).filter(([key]) => key !== 'sscRetry'))
      : init;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_FETCH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await nativeFetch(input, requestInit);
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
