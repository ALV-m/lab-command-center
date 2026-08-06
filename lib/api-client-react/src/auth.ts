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

export type UserRole = "super_admin" | "admin";

export type SubmenuKey =
  | "overview"
  | "computers"
  | "alerts"
  | "usb_policies"
  | "antivirus"
  | "firewall"
  | "peripherals"
  | "sessions"
  | "reports"
  | "files"
  | "events"
  | "checkins"
  | "agent"
  | "settings"
  | "users";

export interface UserAccount {
  id: number;
  username: string;
  role: UserRole;
  submenuAccess: SubmenuKey[];
  createdAt: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: UserAccount;
}

export interface AuthMeResult {
  user: UserAccount;
}

export interface UsersListResult {
  users: UserAccount[];
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
  submenuAccess: SubmenuKey[];
}

export interface UpdateUserInput {
  password?: string;
  role?: UserRole;
  submenuAccess?: SubmenuKey[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginUrl = (): string => "/api/auth/login";

export const login = async (
  data: BodyType<LoginInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<LoginResult> => {
  return customFetch<LoginResult>(loginUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const logoutUrl = (): string => "/api/auth/logout";

export const logout = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>(logoutUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
  });
};

export const meUrl = (): string => "/api/auth/me";

export const getMe = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<AuthMeResult> => {
  return customFetch<AuthMeResult>(meUrl(), {
    ...options,
    method: "GET",
    credentials: "include",
  });
};

export const getMeQueryKey = (): readonly string[] => ["/api/auth/me"] as const;

export const getMeQueryOptions = <
  TData = Awaited<ReturnType<typeof getMe>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getMeQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getMe>>> = ({ signal }) =>
    getMe({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getMe>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useGetMe = <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<unknown>>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(getMeQueryOptions(options));

export const getLoginMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof login>>,
      TError,
      { data: BodyType<LoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof login>>,
  TError,
  { data: BodyType<LoginInput> },
  TContext
> => {
  const mutationKey = ["login"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof login>>,
    { data: BodyType<LoginInput> }
  > = (props) => {
    const { data } = props ?? {};
    return login(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useLogin = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof login>>,
      TError,
      { data: BodyType<LoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof login>>,
  TError,
  { data: BodyType<LoginInput> },
  TContext
> => useMutation(getLoginMutationOptions(options));

export const getLogoutMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof logout>>,
      TError,
      void,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<Awaited<ReturnType<typeof logout>>, TError, void, TContext> => {
  const mutationKey = ["logout"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof logout>>, void> = () =>
    logout(requestOptions);

  return { mutationFn, ...mutationOptions };
};

export const useLogout = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof logout>>,
      TError,
      void,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<Awaited<ReturnType<typeof logout>>, TError, void, TContext> =>
  useMutation(getLogoutMutationOptions(options));

// ---------------------------------------------------------------------------
// User management (super admin)
// ---------------------------------------------------------------------------

export const usersUrl = (): string => "/api/users";

export const listUsers = async (
  options?: Parameters<typeof customFetch>[1],
): Promise<UsersListResult> => {
  return customFetch<UsersListResult>(usersUrl(), { ...options, method: "GET" });
};

export const listUsersQueryKey = (): readonly string[] => ["/api/users"] as const;

export const listUsersQueryOptions = <
  TData = Awaited<ReturnType<typeof listUsers>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? listUsersQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listUsers>>> = ({ signal }) =>
    listUsers({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listUsers>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useListUsers = <TData = Awaited<ReturnType<typeof listUsers>>, TError = ErrorType<unknown>>(
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> => useQuery(listUsersQueryOptions(options));

export const createUser = async (
  data: BodyType<CreateUserInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<UserAccount> => {
  return customFetch<UserAccount>(usersUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const updateUser = async (
  userId: number,
  data: BodyType<UpdateUserInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<UserAccount> => {
  return customFetch<UserAccount>(`${usersUrl()}/${userId}`, {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const deleteUser = async (
  userId: number,
  options?: Parameters<typeof customFetch>[1],
): Promise<{ ok: boolean }> => {
  return customFetch<{ ok: boolean }>(`${usersUrl()}/${userId}`, {
    ...options,
    method: "DELETE",
  });
};

export const getCreateUserMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createUser>>,
      TError,
      { data: BodyType<CreateUserInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof createUser>>,
  TError,
  { data: BodyType<CreateUserInput> },
  TContext
> => {
  const mutationKey = ["createUser"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof createUser>>,
    { data: BodyType<CreateUserInput> }
  > = (props) => {
    const { data } = props ?? {};
    return createUser(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useCreateUser = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createUser>>,
      TError,
      { data: BodyType<CreateUserInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof createUser>>,
  TError,
  { data: BodyType<CreateUserInput> },
  TContext
> => useMutation(getCreateUserMutationOptions(options));

export const getUpdateUserMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateUser>>,
      TError,
      { userId: number; data: BodyType<UpdateUserInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof updateUser>>,
  TError,
  { userId: number; data: BodyType<UpdateUserInput> },
  TContext
> => {
  const mutationKey = ["updateUser"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateUser>>,
    { userId: number; data: BodyType<UpdateUserInput> }
  > = (props) => {
    const { userId, data } = props ?? {};
    return updateUser(userId, data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useUpdateUser = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateUser>>,
      TError,
      { userId: number; data: BodyType<UpdateUserInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateUser>>,
  TError,
  { userId: number; data: BodyType<UpdateUserInput> },
  TContext
> => useMutation(getUpdateUserMutationOptions(options));

export const getDeleteUserMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteUser>>,
      TError,
      { userId: number },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof deleteUser>>,
  TError,
  { userId: number },
  TContext
> => {
  const mutationKey = ["deleteUser"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteUser>>,
    { userId: number }
  > = (props) => {
    const { userId } = props ?? {};
    return deleteUser(userId, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useDeleteUser = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteUser>>,
      TError,
      { userId: number },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof deleteUser>>,
  TError,
  { userId: number },
  TContext
> => useMutation(getDeleteUserMutationOptions(options));
