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

export interface UsbDevice {
  id: number;
  computerId: number;
  computerName: string;
  deviceId: string | null;
  driveLetter: string | null;
  label: string | null;
  status: "pending" | "approved" | "denied";
  scanResult: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export const getUsbDevicesUrl = (): string => "/api/lab/usb-devices";

export const getUsbDevices = async (options?: Parameters<typeof customFetch>[1]): Promise<UsbDevice[]> => {
  return customFetch<UsbDevice[]>(getUsbDevicesUrl(), { ...options, method: "GET" });
};

export const getUsbDevicesQueryKey = (): readonly string[] => ["/api/lab/usb-devices"] as const;

export const getUsbDevicesQueryOptions = <
  TData = Awaited<ReturnType<typeof getUsbDevices>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsbDevices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getUsbDevices>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getUsbDevicesQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getUsbDevices>>> = ({ signal }) =>
    getUsbDevices({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getUsbDevices>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetUsbDevices = <TData = Awaited<ReturnType<typeof getUsbDevices>>, TError = ErrorType<unknown>>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getUsbDevices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getUsbDevicesQueryOptions(options));

export const decideUsbDeviceUrl = (deviceId: number): string => `/api/lab/usb-devices/${deviceId}/decide`;

export const decideUsbDevice = async (
  deviceId: number,
  data: BodyType<{ status: "approved" | "denied" }>,
  options?: Parameters<typeof customFetch>[1],
): Promise<UsbDevice> => {
  return customFetch<UsbDevice>(decideUsbDeviceUrl(deviceId), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getDecideUsbDeviceMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof decideUsbDevice>>,
      TError,
      { deviceId: number; data: BodyType<{ status: "approved" | "denied" }> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof decideUsbDevice>>,
  TError,
  { deviceId: number; data: BodyType<{ status: "approved" | "denied" }> },
  TContext
> => {
  const mutationKey = ["decideUsbDevice"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof decideUsbDevice>>,
    { deviceId: number; data: BodyType<{ status: "approved" | "denied" }> }
  > = (props) => {
    const { deviceId, data } = props ?? {};
    return decideUsbDevice(deviceId, data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useDecideUsbDevice = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof decideUsbDevice>>,
      TError,
      { deviceId: number; data: BodyType<{ status: "approved" | "denied" }> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof decideUsbDevice>>,
  TError,
  { deviceId: number; data: BodyType<{ status: "approved" | "denied" }> },
  TContext
> => useMutation(getDecideUsbDeviceMutationOptions(options));
