import {
  useQuery,
  type QueryFunction,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import { customFetch, tenantApiPrefix } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export interface AttendanceReportRow {
  id: number;
  studentName: string;
  studentId: string;
  computerName: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: "active" | "ended";
}

export interface ViolationsReportRow {
  id: number;
  type: string;
  message: string;
  actor: string;
  computerName: string | null;
  createdAt: string;
}

export type PeripheralsReportRow = ViolationsReportRow;

export const getAttendanceReportUrl = (days = 0): string => `${tenantApiPrefix()}/reports/attendance?days=${days}`;
export const getViolationsReportUrl = (days = 0): string => `${tenantApiPrefix()}/reports/violations?days=${days}`;
export const getPeripheralsReportUrl = (days = 0): string => `${tenantApiPrefix()}/reports/peripherals?days=${days}`;
export const getAttendanceCsvUrl = (days = 0): string => `${tenantApiPrefix()}/reports/attendance.csv?days=${days}`;
export const getViolationsCsvUrl = (days = 0): string => `${tenantApiPrefix()}/reports/violations.csv?days=${days}`;
export const getPeripheralsCsvUrl = (days = 0): string => `${tenantApiPrefix()}/reports/peripherals.csv?days=${days}`;

export const getAttendanceReport = async (
  days = 0,
  options?: Parameters<typeof customFetch>[1],
): Promise<AttendanceReportRow[]> => {
  return customFetch<AttendanceReportRow[]>(getAttendanceReportUrl(days), { ...options, method: "GET" });
};

export const getAttendanceReportQueryKey = (days = 0): readonly [string, number] =>
  ["/api/reports/attendance", days] as const;

export const getAttendanceReportQueryOptions = <
  TData = Awaited<ReturnType<typeof getAttendanceReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAttendanceReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getAttendanceReport>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getAttendanceReportQueryKey(days);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getAttendanceReport>>> = ({ signal }) =>
    getAttendanceReport(days, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getAttendanceReport>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetAttendanceReport = <
  TData = Awaited<ReturnType<typeof getAttendanceReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAttendanceReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getAttendanceReportQueryOptions(days, options));

export const getViolationsReport = async (
  days = 0,
  options?: Parameters<typeof customFetch>[1],
): Promise<ViolationsReportRow[]> => {
  return customFetch<ViolationsReportRow[]>(getViolationsReportUrl(days), { ...options, method: "GET" });
};

export const getViolationsReportQueryKey = (days = 0): readonly [string, number] =>
  ["/api/reports/violations", days] as const;

export const getViolationsReportQueryOptions = <
  TData = Awaited<ReturnType<typeof getViolationsReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getViolationsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getViolationsReport>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getViolationsReportQueryKey(days);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getViolationsReport>>> = ({ signal }) =>
    getViolationsReport(days, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getViolationsReport>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetViolationsReport = <
  TData = Awaited<ReturnType<typeof getViolationsReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getViolationsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getViolationsReportQueryOptions(days, options));

export const getPeripheralsReport = async (
  days = 0,
  options?: Parameters<typeof customFetch>[1],
): Promise<PeripheralsReportRow[]> => {
  return customFetch<PeripheralsReportRow[]>(getPeripheralsReportUrl(days), { ...options, method: "GET" });
};

export const getPeripheralsReportQueryKey = (days = 0): readonly [string, number] =>
  ["/api/reports/peripherals", days] as const;

export const getPeripheralsReportQueryOptions = <
  TData = Awaited<ReturnType<typeof getPeripheralsReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPeripheralsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getPeripheralsReport>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getPeripheralsReportQueryKey(days);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getPeripheralsReport>>> = ({ signal }) =>
    getPeripheralsReport(days, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getPeripheralsReport>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetPeripheralsReport = <
  TData = Awaited<ReturnType<typeof getPeripheralsReport>>,
  TError = ErrorType<unknown>,
>(
  days = 0,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPeripheralsReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getPeripheralsReportQueryOptions(days, options));
