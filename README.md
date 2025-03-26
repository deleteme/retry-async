# Deno Retry Async

A utility for retrying asynchronous or synchronous operations with customizable options such as retry limits, delays, exponential backoff, and cancellation.

## Installation

Add this module to your Deno project by importing it:

```typescript
import { retry } from "@deleteme/retry-async";
```

## API

### `retry`

Retries a given operation until it succeeds, reaches the maximum number of retries, or is aborted.

#### Signature

```typescript
function retry<T>(
  operation: Operation,
  options?: RetryOptions & { timeout?: number },
): Promise<T>;
```

#### Parameters

- **`operation`**:  
  A function to be retried. It can be either synchronous or asynchronous.  
  ```typescript
  type Operation = (options?: { abortSignal?: AbortSignal }) => any | Promise<any>;
  ```

- **`options`** *(optional)*:  
  An object to configure the retry behavior.  
  ```typescript
  interface RetryOptions {
    maxRetries?: number; // Maximum number of retries (default: 3)
    retryDelay?: number; // Delay between retries in milliseconds (default: 1000)
    decay?: number | DecayFunction; // Exponential backoff factor or custom decay function
    abortSignal?: AbortSignal; // Signal to cancel the retry process
    onBeforeRetry?: (onBeforeRetryArg: { retries: number; rejection: any }) => Promise<void> | void; // Callback invoked after each retry
    timeout?: number; // Maximum time in milliseconds before the operation times out
  }
  ```

#### Return Value

A `Promise` that resolves with the result of the operation or rejects with the last error encountered.

#### Behavior

1. The `operation` is called repeatedly until it resolves successfully or the retry limit is reached.
2. If `retryDelay` is provided, the function waits for the specified delay between retries.
3. If `decay` is provided:
   - If it's a number greater than 1, the delay increases exponentially.
   - If it's a function, it calculates the delay based on the number of retries and the initial delay.
4. If `abortSignal` is provided and aborted, the retry process is canceled immediately.
5. If `timeout` is provided, the retry process will reject with a `TimeoutError` if the total time exceeds the specified duration.
6. The `onBeforeRetry` callback is invoked after each failed attempt, providing details about the retry.

#### Examples

##### Basic Usage

```typescript
import { retry } from "@deleteme/retry-async";

async function fetchData() {
  const result = await retry(async () => {
    const response = await fetch("https://example.com/api");
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  });
  console.log(result);
}
```

##### Custom Retry Options

```typescript
import { retry } from "@deleteme/retry-async";

async function fetchData() {
  const result = await retry(async () => {
    const response = await fetch("https://example.com/api");
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  }, {
    maxRetries: 5,
    retryDelay: 2000,
    decay: 2, // Exponential backoff
    onBeforeRetry: ({ retries, rejection }) => {
      console.log(`Retry #${retries} failed:`, rejection);
    },
  });
  console.log(result);
}
```

##### Aborting the Retry Process

```typescript
import { retry } from "@deleteme/retry-async";

const controller = new AbortController();

setTimeout(() => controller.abort(), 5000); // Abort after 5 seconds

try {
  const result = await retry(async () => {
    const response = await fetch("https://example.com/api", {
      // The abort signal is also passed to this operation function.
      // Ensure the signal is sent to fetch so that it may also abort the request.
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  }, {
    abortSignal: controller.signal,
  });
  console.log(result);
} catch (error) {
  console.error("Operation aborted:", error);
}
```

##### Using a Timeout

```typescript
import { retry } from "@deleteme/retry-async";

try {
  const result = await retry(async () => {
    const response = await fetch("https://example.com/api");
    if (!response.ok) throw new Error("Request failed");
    return response.json();
  }, {
    timeout: 3000, // Timeout after 3 seconds
  });
  console.log(result);
} catch (error) {
  console.error("Operation timed out:", error);
}
```

## License

This project is licensed under the [MIT License](LICENSE).
