import _ from 'lodash';
import { TFunction } from '../../types';

/**
 * @example
 * ```ts
 * const counter = buildCounter(5);
 *
 * counter() // 6
 * counter() // 7
 * counter(2) // 9
 * ```
 */
export const buildCounter =
  (initial = 0, step = 1) =>
  (value = step) =>
    (initial += value);

export const cast = <T>(value: T): T => value;

export const wait = (ms: number) => {
  const context = {
    isCanceled: false,
    timeout: <NodeJS.Timeout | undefined>undefined,
  };

  const promise = new Promise<void>((resolve) =>
    context.isCanceled ? resolve() : (context.timeout = setTimeout(resolve, ms))
  );

  return Object.assign(promise, {
    value: ms,
    abort: () => {
      context.isCanceled = true;
      clearTimeout(context.timeout);
    },
  });
};

/**
 * It helps to iterate with limitation a list of items wrapped with async iterator
 *
 * @example
 * ```ts
 * await chunkify([1, 2, 3, 4, 5], 2, async (item) => item ** 2)
 * // =>
 * // [
 * //   { index: 0, payload: 1, result: { status: 'fulfilled', value: 1 } },
 * //   { index: 1, payload: 2, result: { status: 'fulfilled', value: 4 } },
 * //   { index: 2, payload: 3, result: { status: 'fulfilled', value: 9 } },
 * //   { index: 3, payload: 4, result: { status: 'fulfilled', value: 16 } },
 * //   { index: 4, payload: 5, result: { status: 'fulfilled', value: 25 } }
 * // ]
 * ```
 */
export const chunkify = async <TResult, TPayload, T extends {
  index: number;

  payload: TPayload;
  result: PromiseSettledResult<TResult>;
}>(items: TPayload[], limit: number, iterator: TFunction<Promise<TResult>, [TPayload, number]>): Promise<T[]> => {
  const results: T[] = [];
  const counter = buildCounter(-1);

  const iterate = async (): Promise<null> => {
    const index = counter();
    const payload = items[index];

    if (index >= items.length) {
      return null;
    }

    const [result] = await Promise.allSettled([iterator(payload, index)]);
    results.push(<T>{ index, payload, result });

    return iterate();
  };

  await Promise.all(items.slice(0, limit).map(iterate));
  return results;
};

/**
 * @example
 * ```ts
 * const marker = buildTimeSpendMarker();
 *
 * marker() // 0
 *
 * // Wait for 500ms
 * marker() // 500
 *
 * // Wait for 1500ms
 * marker(Date.now()) // 1500
 * ```
 */
export const buildTimeSpendMarker = (initial: number = Date.now()) => {
  let last = initial;

  return (timestamp: number = Date.now()): number => {
    const diff = timestamp - last;

    last = timestamp;
    return diff;
  };
};

/**
 * Returns preview string of provided object
 *
 * @example
 * ```ts
 * const payload = { foo: 123, bar: '456' };
 * preview(payload) // 'foo=123 bar="456"'
 * ```
*/
export const preview = (payload: object, limit: number = 100): string => {
  const result = Object.entries(payload)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}=[${value.length} items]`;
      }

      if (_.isObject(value)) {
        return `${key}={...}`;
      }

      return `${key}=${typeof value === 'string' ? `"${value}"` : value}`;
    })
    .join(' ');

  return result.length > limit ? `${result.slice(0, limit)}...` : result;
};

/**
 * Helps to compile `dispose` objects for `using` flow
 *
 * @example
 * ```ts
 * await using db = disposify({
 *   entity: await db.connect(),
 *   exit: (connection) => connection.close(),
 * })
 * ```
 */
export const disposify = <T>(parameters: {
  entity: T;
  exit: TFunction<Promise<any>, [T]>;
}): AsyncDisposable & { entity: T } => ({
  entity: parameters.entity,
  [Symbol.asyncDispose]: () => parameters.exit(parameters.entity),
});

export const parseJsonSafe = <T extends object>(serializedJson: string) => {
  try {
    return <const>{
      status: 'OK',
      result: <T>JSON.parse(serializedJson),
    };
  } catch(error) {
    return <const>{
      status: 'ERROR',
      error: error instanceof Error ? error : new Error('Unknown'),
    };
  }
};
