interface OperationOptions {
  abortSignal?: AbortSignal;
}
type SyncOperation = (options?: OperationOptions) => any;
type AsyncOperation = (options?: OperationOptions) => Promise<any>;
type Operation = SyncOperation | AsyncOperation;

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  decay?: number | DecayFunction;
  abortSignal?: AbortSignal;
}

function defaultDecayFn(retries: number, retryDelay: number, decay: number) {
  // given decay = 2, retryDelay = 1000
  // return 1000, 2000, 4000, 8000
  return retryDelay * Math.pow(decay, retries - 1);
}

type DecayFunction = (retries: number, retryDelay: number) => number;

interface DelayOptions {
  abortSignal?: AbortSignal;
}

export function delay(ms: number, options?: DelayOptions) {
  let timeout: ReturnType<typeof setTimeout>;
  return new Promise((resolve, reject) => {
    if (options?.abortSignal?.aborted) {
      reject("aborted");
      return;
    }
    timeout = setTimeout(() => {
      resolve(undefined);
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener("abort", handleAbortSignal);
      }
    }, ms);
    function handleAbortSignal() {
      clearTimeout(timeout);
      options!.abortSignal!.removeEventListener("abort", handleAbortSignal);
      reject("aborted");
    }
    options?.abortSignal?.addEventListener("abort", handleAbortSignal);
  });
}

function calculateDelayMs(
  retries: number,
  retryDelay: number,
  decay: RetryOptions["decay"],
) {
  if (typeof decay === "number") {
    if (decay <= 1) {
      return retryDelay;
    }
    return defaultDecayFn(retries, retryDelay, decay);
  }
  if (typeof decay === "function") {
    return decay(retries, retryDelay);
  }
  return retryDelay;
}

// todo: abort, timeout
async function innerRetry(operation: Operation, options?: RetryOptions) {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;
  const decay = options?.decay;

  let retries = 0;

  const atLimit = () => retries > maxRetries;

  while (!atLimit()) {
    try {
      const value = await operation({ abortSignal: options?.abortSignal });
      return value;
    } catch (rejection) {
      if (rejection === "aborted") throw rejection;
      if (atLimit()) throw rejection;
      retries += 1;
      const delayMs = calculateDelayMs(retries, retryDelay, decay);
      await delay(delayMs);
    }
  }
}

function* generatePromises(
  operation: Operation,
  options?: RetryOptions & { timeout?: number },
) {
  yield innerRetry(operation, options);

  if (options?.timeout) {
    yield delay(options.timeout, {
      abortSignal: options?.abortSignal,
    }).then(() => {
      throw `timeout after ${options.timeout}ms`;
    });
  }
}

export function retry(
  operation: Operation,
  options?: RetryOptions & { timeout?: number },
) {
  return Promise.race(generatePromises(operation, options));
}
