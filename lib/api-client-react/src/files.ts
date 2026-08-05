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

export interface BroadcastPushFileResult {
  fileName: string;
  size: number;
  queued: number;
}

export const broadcastPushFileUrl = (): string => `/api/lab/files/broadcast`;

export const broadcastPushFile = async (
  file: File,
  computerIds?: number[],
  initiatedBy?: string,
  destination?: string,
  options?: Parameters<typeof customFetch>[1],
): Promise<BroadcastPushFileResult> => {
  const headers: Record<string, string> = {
    "x-file-name": encodeURIComponent(file.name),
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (computerIds && computerIds.length > 0) {
    headers["x-computer-ids"] = computerIds.join(",");
  }
  if (initiatedBy) {
    headers["x-initiated-by"] = initiatedBy;
  }
  if (destination) {
    headers["x-destination"] = destination;
  }
  return customFetch<BroadcastPushFileResult>(broadcastPushFileUrl(), {
    ...options,
    method: "POST",
    headers,
    body: file,
  });
};

export interface BroadcastPushFileInput {
  file: File;
  computerIds?: number[];
  initiatedBy?: string;
  destination?: string;
}

export const getBroadcastPushFileMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastPushFile>>,
      TError,
      BroadcastPushFileInput,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof broadcastPushFile>>,
  TError,
  BroadcastPushFileInput,
  TContext
> => {
  const mutationKey = ["broadcastPushFile"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof broadcastPushFile>>,
    BroadcastPushFileInput
  > = (props) => {
    const { file, computerIds, initiatedBy, destination } = props ?? {};
    return broadcastPushFile(file, computerIds, initiatedBy, destination, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useBroadcastPushFile = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastPushFile>>,
      TError,
      BroadcastPushFileInput,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof broadcastPushFile>>,
  TError,
  BroadcastPushFileInput,
  TContext
> => useMutation(getBroadcastPushFileMutationOptions(options));

export interface BroadcastDeleteFilesInput {
  path: string;
  computerIds?: number[];
  initiatedBy?: string;
}

export interface BroadcastDeleteFilesResult {
  queued: number;
}

export const broadcastDeleteFilesUrl = (): string => `/api/lab/files/delete-broadcast`;

export const broadcastDeleteFiles = async (
  data: BroadcastDeleteFilesInput,
  options?: SecondParameter<typeof customFetch>,
): Promise<BroadcastDeleteFilesResult> => {
  return customFetch<BroadcastDeleteFilesResult>(broadcastDeleteFilesUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });
};

export const getBroadcastDeleteFilesMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastDeleteFiles>>,
      TError,
      BroadcastDeleteFilesInput,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof broadcastDeleteFiles>>,
  TError,
  BroadcastDeleteFilesInput,
  TContext
> => {
  const mutationKey = ["broadcastDeleteFiles"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof broadcastDeleteFiles>>,
    BroadcastDeleteFilesInput
  > = (props) => {
    const { path, computerIds, initiatedBy } = props ?? {};
    return broadcastDeleteFiles({ path, computerIds, initiatedBy }, requestOptions);
  };

  return { mutationFn, ...mutationOptions };
};

export const useBroadcastDeleteFiles = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof broadcastDeleteFiles>>,
      TError,
      BroadcastDeleteFilesInput,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof broadcastDeleteFiles>>,
  TError,
  BroadcastDeleteFilesInput,
  TContext
> => useMutation(getBroadcastDeleteFilesMutationOptions(options));

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modifiedAt?: string | null;
}

export interface BrowseFilesResult {
  path: string;
  pending: boolean;
  error?: string | null;
  entries: FileEntry[];
}

export const browseComputerFilesUrl = (computerId: number, path: string): string =>
  `/api/lab/computers/${computerId}/files/browse?path=${encodeURIComponent(path)}`;

export const browseComputerFiles = async (
  computerId: number,
  path: string,
  options?: Parameters<typeof customFetch>[1],
): Promise<BrowseFilesResult> => {
  return customFetch<BrowseFilesResult>(browseComputerFilesUrl(computerId, path), {
    ...options,
    method: "GET",
  });
};

export const getBrowseComputerFilesQueryKey = (computerId: number, path: string) =>
  ["browseComputerFiles", computerId, path] as const;

export const getBrowseComputerFilesQueryOptions = <
  TData = Awaited<ReturnType<typeof browseComputerFiles>>,
  TError = ErrorType<unknown>,
>(
  computerId: number,
  path: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof browseComputerFiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryOptions<Awaited<ReturnType<typeof browseComputerFiles>>, TError, TData> & {
  queryKey: QueryKey;
} => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getBrowseComputerFilesQueryKey(computerId, path);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof browseComputerFiles>>> = ({ signal }) =>
    browseComputerFiles(computerId, path, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof browseComputerFiles>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export function useBrowseComputerFiles<
  TData = Awaited<ReturnType<typeof browseComputerFiles>>,
  TError = ErrorType<unknown>,
>(
  computerId: number,
  path: string,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof browseComputerFiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getBrowseComputerFilesQueryOptions<TData, TError>(computerId, path, options);
  return useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
}
