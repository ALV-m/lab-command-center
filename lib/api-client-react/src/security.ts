import {
  useMutation,
  useQuery,
  type MutationFunction,
  type QueryFunction,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";
import type { BodyType, ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export type SecurityBroadcastAction =
  | "av_scan"
  | "av_update"
  | "av_toggle"
  | "fw_enable"
  | "fw_disable";

export interface SecurityBroadcastInput {
  action: SecurityBroadcastAction;
  type?: "quick" | "full";
  enabled?: boolean;
  initiatedBy?: string;
  computerIds?: number[];
}

export interface SecurityBroadcastResult {
  runId: number | null;
  queued: number;
}

export interface ScanResultRow {
  id: number;
  computerId: number;
  computerName: string;
  status: string;
  detail: string | null;
  finishedAt: string | null;
}

export interface ScanRunRow {
  id: number;
  action: string;
  initiatedBy: string;
  status: string;
  requestedAt: string;
  finishedAt: string | null;
  results: ScanResultRow[];
}

export const broadcastSecurityActionUrl = (): string => "/api/security/broadcast";

export const broadcastSecurityAction = async (
  data: SecurityBroadcastInput,
  options?: Parameters<typeof customFetch>[1],
): Promise<SecurityBroadcastResult> => {
  return customFetch<SecurityBroadcastResult>(broadcastSecurityActionUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getBroadcastSecurityActionMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastSecurityAction>>,
      TError,
      { data: SecurityBroadcastInput },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof broadcastSecurityAction>>,
  TError,
  { data: SecurityBroadcastInput },
  TContext
> => {
  const mutationKey = ["broadcastSecurityAction"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof broadcastSecurityAction>>,
    { data: SecurityBroadcastInput }
  > = (props) => {
    const { data } = props ?? {};
    return broadcastSecurityAction(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useBroadcastSecurityAction = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastSecurityAction>>,
      TError,
      { data: SecurityBroadcastInput },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof broadcastSecurityAction>>,
  TError,
  { data: SecurityBroadcastInput },
  TContext
> => useMutation(getBroadcastSecurityActionMutationOptions(options));

export const getScanReportUrl = (days = 0): string => `/api/reports/scans?days=${days}`;
export const getScansCsvUrl = (days = 0): string => `/api/reports/scans.csv?days=${days}`;
export const getSecurityHealthCsvUrl = (): string => "/api/security/health.csv";

export const getScanReport = async (
  days = 0,
  options?: Parameters<typeof customFetch>[1],
): Promise<ScanRunRow[]> => {
  return customFetch<ScanRunRow[]>(getScanReportUrl(days), { ...options, method: "GET" });
};

export const getScanReportQueryKey = (days = 0): readonly [string, number] =>
  ["/api/reports/scans", days] as const;

export const getScanReportQueryOptions = <
  TData = Awaited<ReturnType<typeof getScanReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScanReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getScanReport>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getScanReportQueryKey(days);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getScanReport>>> = ({ signal }) =>
    getScanReport(days, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getScanReport>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetScanReport = <
  TData = Awaited<ReturnType<typeof getScanReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScanReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getScanReportQueryOptions(days, options));
