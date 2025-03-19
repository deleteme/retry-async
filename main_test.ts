import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import {
  assertSpyCall,
  assertSpyCalls,
  returnsNext,
  spy,
} from "@std/testing/mock";
import { FakeTime } from "@std/testing/time";
import { retry } from "./main.ts";

const success = async () => "success";
const successSync = () => "success";
const failure = async () => {
  throw "failure";
};

Deno.test.only("retry() will call the operation again after 1s if it rejects", async () => {
  using time = new FakeTime();
  function* generateCalls() {
    yield Promise.reject("failure");
    yield Promise.resolve("success");
  }
  const succeedAfterOneFailure = spy(returnsNext(generateCalls()));
  const retryPromise = retry({ operation: succeedAfterOneFailure });
  assertSpyCalls(succeedAfterOneFailure, 1);
  await time.tickAsync(999); // 999ms later
  assertSpyCalls(succeedAfterOneFailure, 1);

  await time.tickAsync(1); // 1s later
  assertSpyCalls(succeedAfterOneFailure, 2);
  //assertSpyCall(succeedAfterOneFailure, 1);
  const result = await retryPromise;
  expect(result).toBe("success");
});

describe("retry() happy path", () => {
  it("resolves when the operation resolves", async () => {
    expect.assertions(1);
    const result = await retry({ operation: success });
    expect(result).toBe("success");
  });
  it("resolves when the operation returns synchronously", async () => {
    expect.assertions(1);
    const result = await retry({ operation: successSync });
    expect(result).toBe("success");
  });
});
