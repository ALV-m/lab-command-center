import {
  useMutation,
  type MutationFunction,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";
import type { BodyType, ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export interface RegisterTenantInput {
  orgName: string;
  contactName: string;
  contactEmail: string;
  username: string;
  password: string;
}

export interface TenantAccount {
  id: number;
  name: string;
  slug: string;
  status: "active" | "suspended";
}

export interface RegisterTenantResult {
  tenant: TenantAccount;
}

export const registerTenantUrl = (): string => "/api/tenant/register";

export const registerTenant = async (
  data: BodyType<RegisterTenantInput>,
  options?: Parameters<typeof customFetch>[1],
): Promise<RegisterTenantResult> => {
  return customFetch<RegisterTenantResult>(registerTenantUrl(), {
    ...options,
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getRegisterTenantMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof registerTenant>>,
      TError,
      { data: BodyType<RegisterTenantInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof registerTenant>>,
  TError,
  { data: BodyType<RegisterTenantInput> },
  TContext
> => {
  const mutationKey = ["registerTenant"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof registerTenant>>,
    { data: BodyType<RegisterTenantInput> }
  > = (props) => {
    const { data } = props ?? {};
    return registerTenant(data, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useRegisterTenant = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof registerTenant>>,
      TError,
      { data: BodyType<RegisterTenantInput> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof registerTenant>>,
  TError,
  { data: BodyType<RegisterTenantInput> },
  TContext
> => useMutation(getRegisterTenantMutationOptions(options));
