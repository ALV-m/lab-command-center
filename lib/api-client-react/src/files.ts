import {
  useMutation,
  type MutationFunction,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

export interface PushFileResult {
  actionId: number;
  fileName: string;
  size: number;
}

export const pushFileToComputerUrl = (computerId: number): string => `/api/lab/computers/${computerId}/files`;

export const pushFileToComputer = async (
  computerId: number,
  file: File,
  options?: Parameters<typeof customFetch>[1],
): Promise<PushFileResult> => {
  return customFetch<PushFileResult>(pushFileToComputerUrl(computerId), {
    ...options,
    method: "POST",
    headers: { "x-file-name": encodeURIComponent(file.name), ...options?.headers },
    body: file,
  });
};

export const getPushFileToComputerMutationOptions = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof pushFileToComputer>>,
      TError,
      { computerId: number; file: File },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof pushFileToComputer>>,
  TError,
  { computerId: number; file: File },
  TContext
> => {
  const mutationKey = ["pushFileToComputer"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof pushFileToComputer>>, { computerId: number; file: File }> =
    (props) => {
      const { computerId, file } = props ?? {};
      return pushFileToComputer(computerId, file, requestOptions);
    };

  return { mutationFn, ...mutationOptions };
};

export const usePushFileToComputer = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof pushFileToComputer>>,
      TError,
      { computerId: number; file: File },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof pushFileToComputer>>,
  TError,
  { computerId: number; file: File },
  TContext
> => useMutation(getPushFileToComputerMutationOptions(options));
