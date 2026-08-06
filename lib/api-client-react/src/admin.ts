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

export type PlatformAdminStatus = "active" | "suspended";

export interface PlatformAdminAccount {
  id: number;
  username: string;
  createdAt: string;
}

export interface AdminLoginInput {
  username: string;
  password: string;
}

export interface AdminLoginResult {
  user: PlatformAdminAccount;
}

export interface AdminMeResult {
  user: PlatformAdminAccount;
}

export interface TenantListItem {
  id: number;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
  status: PlatformAdminStatus;
  createdAt: string;
  computers: number;
  admins: number;
}

export interface TenantsListResult {
  tenants: TenantListItem[];
}

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalComputers: number;
  totalAdmins: number;
}

export interface PlatformStatsResult {
  stats: PlatformStats;
}

export interface TenantStatusUpdateInput {
  status: PlatformAdminStatus;
}

export interface TenantAdminPasswordInput {
  password: string;
}

// ---------------------------------------------------------------------------
// Login / logout / me
// ---------------------------------------------------------------------------

export const adminLoginUrl = (): string => "/api/admin/login";

export const adminLogin = async (
  data: BodyType<AdminLoginInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<AdminLoginResult> => {
  return customFetch<AdminLoginResult>(adminLoginUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const adminLogoutUrl = (): string => "/api/admin/logout";

export const adminLogout = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>(adminLogoutUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
  });
};

export const adminMeUrl = (): string => "/api/admin/me";

export const getAdminMe = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<AdminMeResult> => {
  return customFetch<AdminMeResult>(adminMeUrl(), {
    ...options,
    method: "GET",
    credentials: "include",
  });
};

export const getAdminMeQueryKey = (): readonly string[] => ["/api/admin/me"] as const;

export const getAdminMeQueryOptions = <
  TData = Awaited<ReturnType<typeof getAdminMe>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getAdminMe>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getAdminMeQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getAdminMe>>> = ({ signal }) =>
    getAdminMe({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getAdminMe>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetAdminMe = <
  TData = Awaited<ReturnType<typeof getAdminMe>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getAdminMeQueryOptions(options));

export const getAdminLoginMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof adminLogin>>,
      TError,
      { data: BodyType<AdminLoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof adminLogin>>,
  TError,
  { data: BodyType<AdminLoginInput> },
  TContext
> => {
  const mutationKey = ["adminLogin"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof adminLogin>>,
    { data: BodyType<AdminLoginInput> }
  > = (props) => {
    const { data } = props ?? {};
    return adminLogin(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useAdminLogin = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof adminLogin>>,
      TError,
      { data: BodyType<AdminLoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof adminLogin>>,
  TError,
  { data: BodyType<AdminLoginInput> },
  TContext
> => useMutation(getAdminLoginMutationOptions(options));

export const getAdminLogoutMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof adminLogout>>,
      TError,
      void,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<Awaited<ReturnType<typeof adminLogout>>, TError, void, TContext> => {
  const mutationKey = ["adminLogout"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof adminLogout>>, void> = () =>
    adminLogout(requestOptions);

  return { mutationFn, ...mutationOptions };
};

export const useAdminLogout = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof adminLogout>>,
      TError,
      void,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<Awaited<ReturnType<typeof adminLogout>>, TError, void, TContext> =>
  useMutation(getAdminLogoutMutationOptions(options));

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export const adminTenantsUrl = (): string => "/api/admin/tenants";

export const listAdminTenants = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<TenantsListResult> => {
  return customFetch<TenantsListResult>(adminTenantsUrl(), { ...options, method: "GET" });
};

export const listAdminTenantsQueryKey = (): readonly string[] => ["/api/admin/tenants"] as const;

export const listAdminTenantsQueryOptions = <
  TData = Awaited<ReturnType<typeof listAdminTenants>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAdminTenants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof listAdminTenants>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? listAdminTenantsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listAdminTenants>>> = ({ signal }) =>
    listAdminTenants({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listAdminTenants>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useListAdminTenants = <
  TData = Awaited<ReturnType<typeof listAdminTenants>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAdminTenants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(listAdminTenantsQueryOptions(options));

export const updateTenantStatus = async (
  tenantId: number,
  data: BodyType<TenantStatusUpdateInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<TenantListItem> => {
  return customFetch<TenantListItem>(`${adminTenantsUrl()}/${tenantId}`, {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getUpdateTenantStatusMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateTenantStatus>>,
      TError,
      { tenantId: number; data: BodyType<TenantStatusUpdateInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof updateTenantStatus>>,
  TError,
  { tenantId: number; data: BodyType<TenantStatusUpdateInput> },
  TContext
> => {
  const mutationKey = ["updateTenantStatus"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateTenantStatus>>,
    { tenantId: number; data: BodyType<TenantStatusUpdateInput> }
  > = (props) => {
    const { tenantId, data } = props ?? {};
    return updateTenantStatus(tenantId, data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useUpdateTenantStatus = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateTenantStatus>>,
      TError,
      { tenantId: number; data: BodyType<TenantStatusUpdateInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateTenantStatus>>,
  TError,
  { tenantId: number; data: BodyType<TenantStatusUpdateInput> },
  TContext
> => useMutation(getUpdateTenantStatusMutationOptions(options));

export const resetTenantAdminPassword = async (
  tenantId: number,
  data: BodyType<TenantAdminPasswordInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>(`${adminTenantsUrl()}/${tenantId}/reset-password`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getResetTenantAdminPasswordMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof resetTenantAdminPassword>>,
      TError,
      { tenantId: number; data: BodyType<TenantAdminPasswordInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof resetTenantAdminPassword>>,
  TError,
  { tenantId: number; data: BodyType<TenantAdminPasswordInput> },
  TContext
> => {
  const mutationKey = ["resetTenantAdminPassword"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof resetTenantAdminPassword>>,
    { tenantId: number; data: BodyType<TenantAdminPasswordInput> }
  > = (props) => {
    const { tenantId, data } = props ?? {};
    return resetTenantAdminPassword(tenantId, data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useResetTenantAdminPassword = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof resetTenantAdminPassword>>,
      TError,
      { tenantId: number; data: BodyType<TenantAdminPasswordInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof resetTenantAdminPassword>>,
  TError,
  { tenantId: number; data: BodyType<TenantAdminPasswordInput> },
  TContext
> => useMutation(getResetTenantAdminPasswordMutationOptions(options));

export const deleteTenant = async (
  tenantId: number,
  options?: Parameters<typeof customFetch>[1],
): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>(`${adminTenantsUrl()}/${tenantId}`, {
    ...options,
    method: "DELETE",
  });
};

export const getDeleteTenantMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTenant>>, TError, { tenantId: number }, TContext>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<Awaited<ReturnType<typeof deleteTenant>>, TError, { tenantId: number }, TContext> => {
  const mutationKey = ["deleteTenant"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteTenant>>,
    { tenantId: number }
  > = (props) => {
    const { tenantId } = props ?? {};
    return deleteTenant(tenantId, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useDeleteTenant = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTenant>>, TError, { tenantId: number }, TContext>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<Awaited<ReturnType<typeof deleteTenant>>, TError, { tenantId: number }, TContext> =>
  useMutation(getDeleteTenantMutationOptions(options));

export const adminStatsUrl = (): string => "/api/admin/stats";

export const getAdminStats = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<PlatformStatsResult> => {
  return customFetch<PlatformStatsResult>(adminStatsUrl(), { ...options, method: "GET" });
};

export const getAdminStatsQueryKey = (): readonly string[] => ["/api/admin/stats"] as const;

export const getAdminStatsQueryOptions = <
  TData = Awaited<ReturnType<typeof getAdminStats>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getAdminStatsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getAdminStats>>> = ({ signal }) =>
    getAdminStats({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getAdminStats>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetAdminStats = <
  TData = Awaited<ReturnType<typeof getAdminStats>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getAdminStatsQueryOptions(options));
