import {
  useQuery,
  type QueryFunction,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export type PeripheralKind = "keyboard" | "mouse" | "monitor" | "display" | "other";

export interface Peripheral {
  id: number;
  computerId: number;
  computerName: string;
  kind: PeripheralKind;
  name: string;
  instanceId: string;
  present: boolean;
  firstSeenAt: string;
  lastChangedAt: string;
}

export const getPeripheralsUrl = (computerId?: number): string =>
  computerId ? `/api/lab/peripherals?computerId=${computerId}` : "/api/lab/peripherals";

export const getPeripherals = async (
  computerId?: number,
  options?: Parameters<typeof customFetch>[1],
): Promise<Peripheral[]> => {
  return customFetch<Peripheral[]>(getPeripheralsUrl(computerId), { ...options, method: "GET" });
};

export const getPeripheralsQueryKey = (computerId?: number): readonly [string, number?] =>
  ["/api/lab/peripherals", computerId] as const;

export const getPeripheralsQueryOptions = <
  TData = Awaited<ReturnType<typeof getPeripherals>>,
  TError = ErrorType<unknown>,
>(
  computerId?: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPeripherals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getPeripherals>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getPeripheralsQueryKey(computerId);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getPeripherals>>> = ({ signal }) =>
    getPeripherals(computerId, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getPeripherals>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetPeripherals = <TData = Awaited<ReturnType<typeof getPeripherals>>, TError = ErrorType<unknown>>(
  computerId?: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPeripherals>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getPeripheralsQueryOptions(computerId, options));
