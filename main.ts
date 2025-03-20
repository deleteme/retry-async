type Operation = () => any;
type AsyncOperation = () => Promise<any>;

interface RetryOptions {
  operation: AsyncOperation | Operation;
  maxRetries?: number;
  retryDelay?: number;
  decay?: number | DecayFunction;
  timeout?: number;
}

function defaultDecayFn(retries: number, retryDelay: number, decay: number) {
  // given decay = 2, retryDelay = 1000
  // return 1000, 2000, 4000, 8000
  return retryDelay * Math.pow(decay, retries - 1);
}

type DecayFunction = (retries: number, retryDelay: number) => number;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, ms)
  });
}

function calculateDelayMs(retries: number, retryDelay: number, decay: RetryOptions['decay']) {
  if (typeof decay === 'number') {
    if (decay <= 1) {
      return retryDelay;
    }
    return defaultDecayFn(retries, retryDelay, decay);
  }
  if (typeof decay === 'function') {
    return decay(retries, retryDelay);
  }
  return retryDelay;
}

// todo: abort
export async function retry({
  operation,
  maxRetries = 3,
  retryDelay = 1000,
  decay = 0,
}: RetryOptions) {
  let retries = 0;
  const atLimit = () => {
    return retries > maxRetries;
  };
  while (!atLimit()) {
    try {
      const value = await operation();
      return value;
    } catch (rejection) {
      if (atLimit()) throw rejection;
      retries += 1;
      const delayMs = calculateDelayMs(retries, retryDelay, decay);
      await delay(delayMs);
    }
  }
}
