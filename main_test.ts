import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  assertSpyCall,
  assertSpyCallArgs,
  assertSpyCalls,
  returnsNext,
  spy,
} from "@std/testing/mock";
import { FakeTime } from "@std/testing/time";
import { delay, retry } from "./main.ts";

const success = async () => "success";
const successSync = () => "success";
const failure = async () => {
  throw "failure";
};

describe("delay()", () => {
  it("resolves after the given time", async () => {
    using time = new FakeTime();
    const promise = delay(1000);
    await time.tickAsync(999);
    await time.tickAsync(1);
    expect(promise).resolves.toBe(undefined);
  });
  it("rejects if the signal is aborted before the given time", async () => {
    const controller = new AbortController();
    function run() {
      const promise = delay(1000, { abortSignal: controller.signal });
      controller.abort();
      return promise;
    }
    expect(run()).rejects.toBeInstanceOf(DOMException);
    expect(run()).rejects.toThrow();
    expect(run()).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });
  });
  it("rejects if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    function run() {
      return delay(1000, { abortSignal: controller.signal });
    }
    expect(run()).rejects.toBeInstanceOf(DOMException);
    expect(run()).rejects.toThrow();
    expect(run()).rejects.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });
  });
});

describe("retry() unhappy path", () => {
  it("will call the operation again after 1s if it rejects", async () => {
    using time = new FakeTime();
    function* generateCalls() {
      yield Promise.reject("failure");
      yield Promise.resolve("success");
    }
    const succeedAfterOneFailure = spy(returnsNext(generateCalls()));
    const retryPromise = retry(succeedAfterOneFailure);
    assertSpyCalls(succeedAfterOneFailure, 1);
    await time.tickAsync(999); // 999ms later
    assertSpyCalls(succeedAfterOneFailure, 1);

    await time.tickAsync(1); // 1s later
    assertSpyCalls(succeedAfterOneFailure, 2);

    const result = await retryPromise;
    expect(result).toBe("success");
    assertSpyCalls(succeedAfterOneFailure, 2);
  });
  it("will call the operation every 1s, up to max number of retries until it rejects", async () => {
    using time = new FakeTime();
    function* generateCalls() {
      while (true) {
        yield Promise.reject("failure");
      }
    }
    const alwaysFail = spy(returnsNext(generateCalls()));
    const retryPromise = retry(alwaysFail, { maxRetries: 2 });
    assertSpyCalls(alwaysFail, 1);
    await time.tickAsync(999); // 999ms later
    assertSpyCalls(alwaysFail, 1);

    await time.tickAsync(1); // 1s later, 1st retry
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(999); // 999ms later
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(1); // 1s later, 2nd and final retry
    assertSpyCalls(alwaysFail, 3);

    await time.runAllAsync();

    expect(retryPromise).resolves.toBe("failure");
    assertSpyCalls(alwaysFail, 3);
  });
  it('will call the operation every "retryDelay" ms, up to max number of retries until it rejects', async () => {
    using time = new FakeTime();
    function* generateCalls() {
      while (true) {
        yield Promise.reject("failure");
      }
    }
    const alwaysFail = spy(returnsNext(generateCalls()));
    const retryPromise = retry(alwaysFail, { maxRetries: 2, retryDelay: 2000 });
    assertSpyCalls(alwaysFail, 1);
    await time.tickAsync(1999); // 1999ms later
    assertSpyCalls(alwaysFail, 1);

    await time.tickAsync(1); // 1s later, 1st retry
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(1999); // 1999ms later
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(1); // 1s later, 2nd and final retry
    assertSpyCalls(alwaysFail, 3);

    await time.runAllAsync();

    expect(retryPromise).resolves.toBe("failure");
    assertSpyCalls(alwaysFail, 3);
  });
  it("will call the operation at an decreasing frequency (decay), up to max number of retries until it rejects", async () => {
    using time = new FakeTime();
    function* generateCalls() {
      while (true) {
        yield Promise.reject("failure");
      }
    }
    const alwaysFail = spy(returnsNext(generateCalls()));
    const retryPromise = retry(alwaysFail, { maxRetries: 3, decay: 2 });
    assertSpyCalls(alwaysFail, 1);

    // expected delays: 1s, 2s, 4s

    await time.tickAsync(999); // 999ms later
    assertSpyCalls(alwaysFail, 1);

    await time.tickAsync(1); // 1s later, 1st retry
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(1999); // 1999ms later
    assertSpyCalls(alwaysFail, 2);

    await time.tickAsync(1); // 2s later, 2nd retry
    assertSpyCalls(alwaysFail, 3);

    await time.tickAsync(3999); // 3999ms later
    assertSpyCalls(alwaysFail, 3);

    await time.tickAsync(1); // 4s later, 3rd and final retry
    assertSpyCalls(alwaysFail, 4);

    await time.runAllAsync();

    expect(retryPromise).resolves.toBe("failure");
    assertSpyCalls(alwaysFail, 4);
  });
});

describe("retry() cancellation w/abort signal", () => {
  it("should abort the operation", async () => {
    expect.assertions(6);
    const controller = new AbortController();

    let succeeded = 0;
    const successSpy = () => succeeded += 1;
    let innerAborted = 0;
    const innerAbortedSpy = () => {
      innerAborted += 1;
    };
    let outerAborted = 0;
    const outerAbortedSpy = (value: any) => {
      outerAborted += 1;
      return value;
    };
    const takeAWhile = async (options?: {
      abortSignal?: AbortSignal;
    }) => {
      try {
        await delay(1000, { abortSignal: options?.abortSignal });
        successSpy();
      } catch (error) {
        innerAbortedSpy();
        throw error;
      }
    };
    const promise = retry(takeAWhile, { abortSignal: controller.signal }).catch(
      outerAbortedSpy,
    );
    controller.abort();
    await promise;
    expect(succeeded).toBe(0);
    expect(innerAborted).toBe(1);
    expect(outerAborted).toBe(1);
    // using resolve here to avoid uncaught rejected promises error
    expect(promise).resolves.toBeInstanceOf(DOMException);
    expect(promise).resolves.toThrow();
    expect(promise).resolves.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });
  });
  it("should abort the timeout option", async () => {
    // assert the that the delay from the options.timeout is aborted
    using time = new FakeTime();
    const outerAbortedSpy = spy((value: string) => value);
    const controller = new AbortController();
    const indefinitely = spy((options?: {
      abortSignal?: AbortSignal;
    }) => {
      return new Promise(() => {});
    });
    const promise = retry(indefinitely, {
      abortSignal: controller.signal,
      timeout: 10,
    }).catch(outerAbortedSpy);
    await time.tickAsync(5);
    controller.abort();
    await time.tickAsync(1050);
    assertSpyCalls(indefinitely, 1);
    assertSpyCall(indefinitely, 0, {
      args: [{ abortSignal: controller.signal }],
    });
    assertSpyCalls(outerAbortedSpy, 1);
    // using resolve here to avoid uncaught rejected promises error
    expect(promise).resolves.toBeInstanceOf(DOMException);
    expect(promise).resolves.toThrow();
    expect(promise).resolves.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });
  });
  it("should abort the pending retry if the signal is aborted", async () => {
    using time = new FakeTime();
    const outerAbortedSpy = spy((value: string) => value);
    const controller = new AbortController();
    const never = spy((options?: {
      abortSignal?: AbortSignal;
    }) => {
      return Promise.reject("oh no");
    });
    const promise = retry(never, {
      retryDelay: 10000,
      abortSignal: controller.signal,
    }).catch(outerAbortedSpy);
    await time.tickAsync(5);
    controller.abort();
    await time.tickAsync(1050);
    assertSpyCalls(never, 1);
    assertSpyCall(never, 0, {
      args: [{ abortSignal: controller.signal }],
    });
    assertSpyCalls(outerAbortedSpy, 1);
    // using resolve here to avoid uncaught rejected promises error
    expect(promise).resolves.toBeInstanceOf(DOMException);
    expect(promise).resolves.toThrow();
    expect(promise).resolves.toMatchObject({
      name: "AbortError",
      message: "The operation was aborted.",
    });
  });
});

describe("retry() happy path", () => {
  it("resolves when the operation resolves", async () => {
    expect.assertions(1);
    const result = await retry(success);
    expect(result).toBe("success");
  });
  it("resolves when the operation returns synchronously", async () => {
    expect.assertions(1);
    const result = await retry(successSync);
    expect(result).toBe("success");
  });
});

describe("retry() unhappy path", () => {
  it("will call the operation every 1s, until it timeouts and rejects", async () => {
    using time = new FakeTime();
    function* generateCalls() {
      yield delay(250).then(failure);
      yield delay(250).then(failure);
      yield delay(250).then(failure);
    }
    const alwaysFail = spy(returnsNext(generateCalls()));
    const handleFailure = spy((error: Error) => error);
    //const handleFailure = fn(async (error: Error) => error) as (reason: any) => PromiseLike<never>;
    const retryPromise = retry(alwaysFail, {
      maxRetries: 2,
      timeout: 600,
      retryDelay: 300,
    }).catch(handleFailure);

    // we want to timeout before the 3rd call finishes
    // call 1 .......... 250ms . retryDelay 1 .......... 550ms . call 2 .......... 800ms . retryDelay 2 .......... 1100ms . call 3 .......... 1350ms
    // timeout ....................................................... 600ms .

    // call 1 starts
    assertSpyCalls(alwaysFail, 1);
    await time.tickAsync(250);
    assertSpyCalls(alwaysFail, 1);
    // call 1 finishes
    await time.tickAsync(299);
    // retry 1 finishes
    assertSpyCalls(alwaysFail, 1);
    // call 1 finishes

    // call 2 starts
    await time.tickAsync(1);
    assertSpyCalls(alwaysFail, 2);
    await time.tickAsync(50);
    assertSpyCalls(alwaysFail, 2);
    // timeout rejects

    await time.runAllAsync();

    assertSpyCalls(handleFailure, 1);
    // using resolve here to avoid uncaught rejected promises error
    expect(retryPromise).resolves.toBeInstanceOf(DOMException);
    expect(retryPromise).resolves.toThrow();
    expect(retryPromise).resolves.toMatchObject({
      name: "TimeoutError",
      message: "The operation timed out.",
    });
    assertSpyCalls(alwaysFail, 2);
    await time.runAllAsync();
    await time.runAllAsync();
  });
});
