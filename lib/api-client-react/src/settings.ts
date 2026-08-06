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

export interface LabSettings {
  idleLogoutMinutes: number | null;
  signinMethod: "password" | "shared_account" | null;
  sharedAccountUser: string | null;
  sharedAccountPassword: string | null;
  adminGateSecret: string | null;
  adminWindowsUser: string | null;
  blockDownloads: boolean | null;
}

export interface UpdateLabSettingsInput {
  idleLogoutMinutes?: number | null;
  signinMethod?: "password" | "shared_account" | null;
  sharedAccountUser?: string | null;
  sharedAccountPassword?: string | null;
  adminGateSecret?: string | null;
  adminWindowsUser?: string | null;
  blockDownloads?: boolean | null;
}

export const getLabSettingsUrl = (): string => "/api/lab/settings";

export const getLabSettings = async (options?: Parameters<typeof customFetch>[1]): Promise<LabSettings> => {
  return customFetch<LabSettings>(getLabSettingsUrl(), { ...options, method: "GET" });
};

export const getLabSettingsQueryKey = (): readonly string[] => ["/api/lab/settings"] as const;

export const getLabSettingsQueryOptions = <
  TData = Awaited<ReturnType<typeof getLabSettings>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLabSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getLabSettings>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getLabSettingsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getLabSettings>>> = ({ signal }) =>
    getLabSettings({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getLabSettings>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetLabSettings = <TData = Awaited<ReturnType<typeof getLabSettings>>, TError = ErrorType<unknown>>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getLabSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getLabSettingsQueryOptions(options));

export const updateLabSettingsUrl = (): string => "/api/lab/settings";

export const updateLabSettings = async (
  data: BodyType<UpdateLabSettingsInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<LabSettings> => {
  return customFetch<LabSettings>(updateLabSettingsUrl(), {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getUpdateLabSettingsMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateLabSettings>>,
      TError,
      { data: BodyType<UpdateLabSettingsInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof updateLabSettings>>,
  TError,
  { data: BodyType<UpdateLabSettingsInput> },
  TContext
> => {
  const mutationKey = ["updateLabSettings"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateLabSettings>>,
    { data: BodyType<UpdateLabSettingsInput> }
  > = (props) => {
    const { data } = props ?? {};
    return updateLabSettings(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useUpdateLabSettings = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateLabSettings>>,
      TError,
      { data: BodyType<UpdateLabSettingsInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateLabSettings>>,
  TError,
  { data: BodyType<UpdateLabSettingsInput> },
  TContext
> => useMutation(getUpdateLabSettingsMutationOptions(options));
