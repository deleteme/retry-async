interface OperationOptions {
  abortSignal?: AbortSignal;
}
type SyncOperation = (options?: OperationOptions) => any;
type AsyncOperation = (options?: OperationOptions) => Promise<any>;
type Operation = SyncOperation | AsyncOperation;

interface RetryOptions {
  maxRetries?: number; // Maximum number of retries (default: 3)
  retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
  decay?: number | DecayFunction; // Exponential backoff factor or custom decay function
  abortSignal?: AbortSignal; // Signal to cancel the retry process
  onBeforeRetry?: (
    onBeforeRetryArg: { retries: number; rejection: any },
  ) => Promise<void> | void; // Callback invoked after each retry
  timeout?: number; // Maximum time in milliseconds before the operation times out
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

/**
 * Wait for a given amount of time.
 * @param ms - The time to wait before resolving the promise in milliseconds.
 * @param options - An optional object with an abortSignal property to support cancellation.
 * @returns A promise that resolves after the given time in milliseconds.
 */
export function delay(ms: number, options?: DelayOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    if (options?.abortSignal?.aborted) {
      // reason is a DOMException with name 'AbortError'
      reject(options.abortSignal.reason);
      return;
    }
    timeout = setTimeout(() => {
      resolve(undefined);
      if (options?.abortSignal) {
        options.abortSignal.removeEventListener("abort", handleAbortSignal);
      }
    }, ms);
    function handleAbortSignal(event: Event) {
      clearTimeout(timeout);
      options!.abortSignal!.removeEventListener("abort", handleAbortSignal);
      reject((event.target as AbortSignal).reason);
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
      if (options?.abortSignal?.aborted) throw options.abortSignal.reason;
      retries += 1;
      if (atLimit()) throw rejection;
      const delayMs = calculateDelayMs(retries, retryDelay, decay);
      await delay(delayMs, { abortSignal: options?.abortSignal });
      if (options?.onBeforeRetry) {
        await options.onBeforeRetry({ retries, rejection });
      }
    }
  }
}

function* generatePromises(
  operation: Operation,
  options?: RetryOptions,
) {
  yield innerRetry(operation, options);

  if (options?.timeout) {
    yield delay(options.timeout, {
      abortSignal: options?.abortSignal,
    }).then(() => {
      // Reproducing https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
  }
}

/**
 * Retry an operation until it succeeds or the maximum number of retries is reached.
 * @param operation - The operation function to retry.
 * @param options - An optional object to configure retrying behavior.
 * @returns A promise that resolves when the operation succeeds.
 */
export function retry<T>(
  operation: Operation,
  options?: RetryOptions,
): Promise<T> {
  return Promise.race(generatePromises(operation, options));
}
