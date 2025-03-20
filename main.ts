type Operation = () => any;
type AsyncOperation = () => Promise<any>;

interface RetryOptions {
  operation: AsyncOperation | Operation;
  maxRetries?: number;
  retryDelay?: number;
  decay?: number;
  timeout?: number;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, ms)
  });
}

// todo: abort
export async function retry({
  operation,
  maxRetries = 3,
  retryDelay = 1000,
  decay = 1,
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
      await delay(retryDelay);
      retries += 1;
    }
  }
}
