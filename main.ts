type Operation = () => any;
type AsyncOperation = () => Promise<any>;

interface RetryOptions {
  operation: AsyncOperation | Operation;
  maxRetries?: number;
  retryDelay?: number;
  decay?: number;
  timeout?: number;
}

const originalSetTimeout = setTimeout;

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
  while (retries <= maxRetries) {
    try {
      console.log("calling operation");
      const value = await operation();
      console.log("operation resolved, got value", value);
      return value;
    } catch (rejection) {
      await delay(retryDelay);
      retries += 1;
    }
  }
}
