import { PersistStorage, StorageValue } from "zustand/middleware";
import { isNotNil } from "ramda";
import { z } from "zod";
import { get, set, del } from "idb-keyval";
import { debounce, DebounceSettings } from "lodash";

export interface UnwrappedPromise<T> {
  value?: T;
  promise: Promise<T>;
}

export class Future<T> {
  readonly promise: Promise<T>;
  readonly resolve: (t: T) => unknown;
  readonly reject: (err: unknown) => unknown;
  private _valueSlot: T | undefined;

  constructor() {
    let resolve: (t: T) => unknown = () => {};
    let reject: (err: unknown) => unknown = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    promise.then((value) => (this._valueSlot = value));

    this.promise = promise;
    this.resolve = resolve;
    this.reject = reject;
  }

  static unwrapPromise<K>(promise: Promise<K>): UnwrappedPromise<K> {
    let _valueSlot: K | undefined = undefined;
    promise.then((k) => {
      _valueSlot = k;
    });
    return {
      promise,
      get value(): K | undefined {
        return _valueSlot;
      },
    };
  }

  get value(): T | undefined {
    return this._valueSlot;
  }

  get unwrapped(): UnwrappedPromise<T> {
    const fut = this;
    return {
      promise: fut.promise,
      get value(): T | undefined {
        return fut._valueSlot;
      },
    };
  }
}

// Gets from Map. If the value doesn't exist, compute it using the provided lambda
// and store it in the map, and then return it
export function getOrCompute<T>(
  map: Map<string, T>,
  key: string,
  make: () => T,
): T {
  const value = map.get(key);
  if (value !== undefined) return value;

  const newValue = make();
  map.set(key, newValue);

  return newValue;
}

type Result<T> =
  | { success: true; value: T }
  | { success: false; error: unknown };

export const DefaultTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "medium",
});

export async function timePromise<T>(t: () => Promise<T>): Promise<{
  duration: number;
  result: Result<T>;
}> {
  const begin = performance.now();
  try {
    const value = await t();
    const end = performance.now();
    return { duration: end - begin, result: { success: true, value } };
  } catch (error) {
    const end = performance.now();
    return { duration: end - begin, result: { success: false, error } };
  }
}

// Not sure how I feel about this yet, but the idea is at least interesting.
// There is some argument to be made that this kind of thing should not be
// necessary, but at the same time the optional array spread syntax can be
// quite confusing

export function includeIf<T>(b: boolean, ...t: T[]): T[] {
  if (!b) return [];
  return t;
}

export function includeIfExist<T>(...t: (T | null | undefined)[]): T[] {
  return t.filter(isNotNil);
}

export function zustandJsonReviver(_key: string, value: unknown): unknown {
  try {
    if (!value || typeof value !== "object" || !("__typename" in value)) {
      return value;
    }

    switch (value.__typename) {
      case "Map": {
        const schema = z.object({
          state: z.array(z.tuple([z.string(), z.unknown()])),
        });
        const parsed = schema.parse(value);

        return new Map(parsed.state);
      }
      case "Date": {
        const schema = z.object({ state: z.string() });
        const parsed = schema.parse(value);

        return new Date(parsed.state);
      }

      default:
        throw new Error(`Unrecognized typename: ${value.__typename}`);
    }
  } catch (e) {
    console.error(
      `Unrecognized typename: ${String(JSON.stringify(value))} with ${e}`,
    );
  }
}

export function zustandJsonReplacer(
  this: unknown,
  _key: string,
  value: unknown,
): unknown {
  if (value instanceof Map) {
    return {
      __typename: "Map",
      state: [...value.entries()],
    };
  }

  if (typeof this !== "object" || !this) {
    return value;
  }

  const holder = this as Record<string, unknown>;
  const rawValue = holder[_key];
  if (rawValue instanceof Date) {
    return {
      __typename: "Date",
      state: rawValue.toISOString(),
    };
  }

  return value;
}

// TODO: test this code please
class Debouncer {
  private currentFut = new Future<true>();
  private isRunning = false;

  private readonly debouncedFunc: (
    r: () => Promise<void>,
  ) => Promise<void> | undefined;

  constructor(waitTime?: number, opts?: DebounceSettings) {
    const leading = opts?.leading;
    const trailing = opts?.trailing ?? true;

    this.debouncedFunc = debounce(
      async (r) => {
        // TODO: timeouts
        if (this.isRunning) {
          return; // If we're already running, we shouldn't run again.
        }

        if (leading && this.currentFut.value) {
          this.currentFut = new Future();
        }

        try {
          await r();
        } catch (error) {
          console.error(`Failure ${String(error)}`);
        } finally {
          this.isRunning = false;
          this.currentFut.resolve(true);

          if (trailing) {
            this.currentFut = new Future();
          }
        }
      },
      waitTime,
      opts,
    );
  }

  async run(r: () => Promise<void>) {
    this.debouncedFunc(r);

    return await this.currentFut.promise;
  }
}

// operations should be linearized
// set operations and remove operations should be debounced
class IdbStorage implements PersistStorage<unknown> {
  private readonly mutexes = new Map<string, Mutex>();
  private readonly debouncers = new Map<string, Debouncer>();

  mutex(name: string) {
    return getOrCompute(this.mutexes, name, () => new Mutex());
  }

  debouncer(name: string) {
    const debouncer = getOrCompute(
      this.debouncers,
      name,
      () =>
        new Debouncer(500, {
          leading: true,
          trailing: true,
          maxWait: 5_000,
        }),
    );
    return {
      async debounce(r: () => Promise<void>) {
        await debouncer.run(r);
      },
    };
  }

  async getItem(name: string): Promise<StorageValue<unknown> | null> {
    return this.mutex(name).run(async () => {
      const { result, duration } = await timePromise(() => get(name));
      console.log(
        `Read ${name}${!result.success ? " (failed)" : ""} in ${duration}ms`,
      );
      if (!result.success) throw result.error;

      return result.value;
    });
  }

  async setItem(name: string, value: StorageValue<unknown>): Promise<void> {
    await this.debouncer(name).debounce(() => {
      return this.mutex(name).run(async () => {
        const { result, duration } = await timePromise(() => set(name, value));
        console.log(
          `Wrote ${name}${!result.success ? " (failed)" : ""} in ${duration}ms`,
        );
      });
    });
  }

  async removeItem(name: string): Promise<void> {
    return this.mutex(name).run(async () => {
      const { result, duration } = await timePromise(() => del(name));
      console.log(
        `Deleted ${name}${!result.success ? " (failed)" : ""} in ${duration}ms`,
      );
    });
  }
}

export const ZustandIdbStorage: PersistStorage<unknown> = new IdbStorage();

// TODO: test this code please
class Mutex {
  private isRunning = false;
  private readonly listeners: (() => unknown)[] = [];

  async run<T>(run: () => Promise<T>): Promise<T> {
    const this_ = this;

    const fut = new Future<T>();

    async function mutexRunner() {
      try {
        const returnValue = await run();
        fut.resolve(returnValue);
      } catch (error) {
        fut.reject(error);
        console.error(`Error in storage`, error);
      } finally {
        const nextListener = this_.listeners.shift();
        if (!nextListener) {
          this_.isRunning = false;
          return;
        }

        nextListener();
      }
    }
    if (!this_.isRunning) {
      this_.isRunning = true;
      mutexRunner();
    } else {
      this_.listeners.push(mutexRunner);
    }

    return fut.promise;
  }
}

export function base64ToBytes(base64: string): ArrayBuffer {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
}

export function bytesToBase64(bytes: ArrayBuffer): string {
  const binString = Array.from(new Uint8Array(bytes), (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}
