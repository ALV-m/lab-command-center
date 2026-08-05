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
import type { ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export interface CheckinEntry {
  id: number;
  computerId: number;
  computerName: string;
  userName?: string | null;
  role?: "student" | "teacher" | "visitor" | "admin" | null;
  studentName: string;
  phone?: string | null;
  admissionNo?: string | null;
  email?: string | null;
  photoFileId?: string | null;
  submittedAt: string;
}

export interface GetCheckinsResult {
  checkins: CheckinEntry[];
}

export const getCheckinsUrl = (): string => `/api/lab/checkins`;

export const getCheckins = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<GetCheckinsResult> => {
  return customFetch<GetCheckinsResult>(getCheckinsUrl(), { ...options, method: "GET" });
};

export const getCheckinsQueryKey = () => ["getCheckins"] as const;

export const getCheckinsQueryOptions = <
  TData = Awaited<ReturnType<typeof getCheckins>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getCheckins>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getCheckinsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getCheckins>>> = ({ signal }) =>
    getCheckins({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getCheckins>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useGetCheckins<
  TData = Awaited<ReturnType<typeof getCheckins>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getCheckinsQueryOptions<TData, TError>(options);
  return useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
}

export interface ScreenshotInfo {
  fileId: string;
  takenAt: string;
}

export interface GetLatestScreenshotResult {
  screenshot: ScreenshotInfo | null;
}

export const getLatestScreenshotUrl = (computerId: number): string =>
  `/api/lab/computers/${computerId}/screenshots/latest`;

export const getLatestScreenshot = async (
  computerId: number,
  options?: Parameters<typeof customFetch>[1],
): Promise<GetLatestScreenshotResult> => {
  return customFetch<GetLatestScreenshotResult>(getLatestScreenshotUrl(computerId), {
    ...options,
    method: "GET",
  });
};

export const screenshotFileUrl = (fileId: string): string =>
  `/api/lab/files/screenshots/${fileId}`;

export const getLatestScreenshotQueryKey = (computerId: number) =>
  ["getLatestScreenshot", computerId] as const;

export const getLatestScreenshotQueryOptions = <
  TData = Awaited<ReturnType<typeof getLatestScreenshot>>,
  TError = ErrorType<unknown>,
>(
  computerId: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLatestScreenshot>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getLatestScreenshot>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getLatestScreenshotQueryKey(computerId);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getLatestScreenshot>>> = ({ signal }) =>
    getLatestScreenshot(computerId, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getLatestScreenshot>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useGetLatestScreenshot<
  TData = Awaited<ReturnType<typeof getLatestScreenshot>>,
  TError = ErrorType<unknown>,
>(
  computerId: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLatestScreenshot>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getLatestScreenshotQueryOptions<TData, TError>(computerId, options);
  return useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
}

export type UsbMode = "allowed" | "blocked" | "review";

export interface SetComputerUsbModeResult {
  computerId: number;
  usbState: UsbMode;
}

export const setComputerUsbModeUrl = (computerId: number): string =>
  `/api/lab/computers/${computerId}/usb-mode`;

export const setComputerUsbMode = async (
  computerId: number,
  mode: UsbMode,
  options?: Parameters<typeof customFetch>[1],
): Promise<SetComputerUsbModeResult> => {
  return customFetch<SetComputerUsbModeResult>(setComputerUsbModeUrl(computerId), {
    ...options,
    method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify({ mode }),
  });
};

export const getSetComputerUsbModeMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof setComputerUsbMode>>,
      TError,
      { computerId: number; mode: UsbMode },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof setComputerUsbMode>>,
  TError,
  { computerId: number; mode: UsbMode },
  TContext
> => {
  const mutationKey = ["setComputerUsbMode"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof setComputerUsbMode>>,
    { computerId: number; mode: UsbMode }
  > = (props) => {
    const { computerId, mode } = props ?? {};
    return setComputerUsbMode(computerId, mode, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useSetComputerUsbMode = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof setComputerUsbMode>>,
      TError,
      { computerId: number; mode: UsbMode },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof setComputerUsbMode>>,
  TError,
  { computerId: number; mode: UsbMode },
  TContext
> => useMutation(getSetComputerUsbModeMutationOptions(options));
