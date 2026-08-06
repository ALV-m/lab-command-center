import {
  useMutation,
  type MutationFunction,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";
import type { BodyType, ErrorType } from "./custom-fetch";
import type { LoginInput, UserAccount } from "./auth";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export interface AdminAccount {
  id: number;
  username: string;
  createdAt: string;
}

export type DiscoverLoginResult =
  | { type: "platform"; user: AdminAccount }
  | { type: "tenant"; tenantSlug: string; tenantName: string; user: UserAccount };

export const discoverLoginUrl = (): string => "/api/login";

export const discoverLogin = async (
  data: BodyType<LoginInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<DiscoverLoginResult> => {
  return customFetch<DiscoverLoginResult>(discoverLoginUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getDiscoverLoginMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof discoverLogin>>,
      TError,
      { data: BodyType<LoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof discoverLogin>>,
  TError,
  { data: BodyType<LoginInput> },
  TContext
> => {
  const mutationKey = ["discoverLogin"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof discoverLogin>>,
    { data: BodyType<LoginInput> }
  > = (props) => {
    const { data } = props ?? {};
    return discoverLogin(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useDiscoverLogin = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof discoverLogin>>,
      TError,
      { data: BodyType<LoginInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof discoverLogin>>,
  TError,
  { data: BodyType<LoginInput> },
  TContext
> => useMutation(getDiscoverLoginMutationOptions(options));
