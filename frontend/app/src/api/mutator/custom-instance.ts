import { Platform } from 'react-native';

import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

const REQUEST_TIMEOUT_MS = 45_000;
const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';

type TokenProvider = () => Promise<string | null>;
type RequestTransport = 'axios' | 'fetch';
type ApiAttemptDiagnostic = {
  baseURL: string;
  transport: RequestTransport;
  reason: string;
  status?: number;
};
type ApiErrorDiagnostic = {
  method: string;
  path: string;
  isMultipart: boolean;
  tokenAttached: boolean;
  attempts: ApiAttemptDiagnostic[];
};

const apiClient = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
});

let tokenProvider: TokenProvider | null = null;

apiClient.interceptors.request.use(async (config) => {
  const headers = {
    ...(config.headers ?? {}),
  } as Record<string, string>;

  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  config.headers = headers as any;

  return config;
});

export function configureApiClient(nextTokenProvider: TokenProvider | null) {
  tokenProvider = nextTokenProvider;
}

class ApiDiagnosticError extends Error {
  details: ApiErrorDiagnostic;

  constructor(message: string, details: ApiErrorDiagnostic) {
    super(message);
    this.name = 'ApiDiagnosticError';
    this.details = details;
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function addCandidateBaseUrl(target: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  target.add(normalizeBaseUrl(trimmed));
}

function getFallbackApiBaseUrls(): string[] {
  const candidates = new Set<string>();
  addCandidateBaseUrl(candidates, CONFIGURED_API_BASE_URL);

  if (__DEV__ && Platform.OS === 'android') {
    // `adb reverse tcp:8393 tcp:8393` makes the phone's localhost point at the computer's backend.
    addCandidateBaseUrl(candidates, 'http://127.0.0.1:8393');
    addCandidateBaseUrl(candidates, 'http://localhost:8393');
  }

  return [...candidates];
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function mergeHeaders(config?: AxiosRequestConfig, options?: AxiosRequestConfig) {
  const headers = {
    ...(config?.headers ?? {}),
    ...(options?.headers ?? {}),
  } as Record<string, unknown>;

  const payload = options?.data ?? config?.data;
  if (isFormData(payload)) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  return headers as AxiosRequestConfig['headers'];
}

function resolveMethod(config: AxiosRequestConfig): string {
  return (config.method ?? 'GET').toString().toUpperCase();
}

function resolvePath(config: AxiosRequestConfig): string {
  return config.url?.toString() ?? '/';
}

function resolveRequestUrl(baseURL: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseURL}${normalizedPath}`;
}

async function getAuthorizationHeader(): Promise<{ value: string | null; attached: boolean }> {
  if (!tokenProvider) {
    return { value: null, attached: false };
  }

  const token = await tokenProvider();
  if (!token) {
    return { value: null, attached: false };
  }

  return { value: `Bearer ${token}`, attached: true };
}

function normalizeHeadersForFetch(headers: AxiosRequestConfig['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (!headers) {
    return normalized;
  }

  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    normalized[key] = String(value);
  });

  return normalized;
}

function isNetworkError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error) && !error.response;
}

function isFetchNetworkError(error: unknown): error is Error {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /network request failed|fetch failed|network error/i.test(error.message))
  );
}

function getRemainingTimeoutMs(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

async function requestWithFetch<T>(
  baseURL: string,
  config: AxiosRequestConfig,
  options: AxiosRequestConfig | undefined,
  tokenHeader: string | null,
  timeoutMs: number,
): Promise<T> {
  const path = resolvePath(config);
  const url = resolveRequestUrl(baseURL, path);
  const headers = normalizeHeadersForFetch(mergeHeaders(config, options));
  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    abortController !== null
      ? setTimeout(() => {
          abortController.abort();
        }, timeoutMs)
      : null;

  delete headers['Content-Type'];
  delete headers['content-type'];

  if (tokenHeader) {
    headers.Authorization = tokenHeader;
  }

  try {
    const response = await fetch(url, {
      method: resolveMethod(config),
      headers,
      body: (options?.data ?? config.data) as BodyInit | null | undefined,
      signal: abortController?.signal,
    });

    const rawText = await response.text();
    const payload = rawText ? (() => {
      try {
        return JSON.parse(rawText);
      } catch {
        return rawText;
      }
    })() : null;

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : `${response.status} ${response.statusText}`.trim();
      const httpError = new Error(message) as Error & { status?: number };
      httpError.status = response.status;
      throw httpError;
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TypeError(`Network request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function getRuntimeErrorDetails(error: unknown): unknown {
  if (error instanceof ApiDiagnosticError) {
    return error.details;
  }

  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status ?? null,
      url: error.config?.url ?? null,
      method: error.config?.method ?? null,
      baseURL: error.config?.baseURL ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return error;
}

export async function customInstance<T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> {
  if (!CONFIGURED_API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured.');
  }

  const baseUrls = getFallbackApiBaseUrls();
  const method = resolveMethod(config);
  const path = resolvePath(config);
  const isMultipart = isFormData(options?.data ?? config.data);
  const attempts: ApiAttemptDiagnostic[] = [];
  const deadlineMs = Date.now() + REQUEST_TIMEOUT_MS;
  let lastError: unknown = null;
  let tokenWasAttached = false;

  for (let index = 0; index < baseUrls.length; index += 1) {
    const baseURL = baseUrls[index];
    const remainingTimeoutMs = getRemainingTimeoutMs(deadlineMs);

    if (remainingTimeoutMs <= 0) {
      attempts.push({
        baseURL,
        transport: isMultipart && Platform.OS !== 'web' ? 'fetch' : 'axios',
        reason: `Global request deadline exceeded after ${REQUEST_TIMEOUT_MS}ms`,
      });
      break;
    }

    const authHeader = await getAuthorizationHeader();
    tokenWasAttached = tokenWasAttached || authHeader.attached;

    try {
      if (isMultipart && Platform.OS !== 'web') {
        return await requestWithFetch<T>(baseURL, config, options, authHeader.value, remainingTimeoutMs);
      }

      const response = await apiClient({
        ...config,
        ...options,
        baseURL,
        timeout: remainingTimeoutMs,
        headers: mergeHeaders(config, options),
      });

      return response.data as T;
    } catch (error) {
      const transport = isMultipart && Platform.OS !== 'web' ? 'fetch' : 'axios';
      const hasMoreBaseUrls = index < baseUrls.length - 1;
      const status =
        axios.isAxiosError(error)
          ? error.response?.status
          : typeof error === 'object' &&
              error !== null &&
              'status' in error &&
              typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : undefined;
      const reason = error instanceof Error ? error.message : 'Unknown request failure';

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const serverMessage = axiosError.response?.data?.message;
        if (serverMessage) {
          attempts.push({
            baseURL,
            transport,
            reason: serverMessage,
            status,
          });
          throw new ApiDiagnosticError(
            `ClearHear API request failed for ${method} ${path}`,
            {
              method,
              path,
              isMultipart,
              tokenAttached: tokenWasAttached,
              attempts,
            },
          );
        }

        if (isNetworkError(error) && hasMoreBaseUrls) {
          attempts.push({
            baseURL,
            transport,
            reason,
            status,
          });
          lastError = error;
          continue;
        }
      }

      if (transport === 'fetch' && isFetchNetworkError(error) && hasMoreBaseUrls) {
        attempts.push({
          baseURL,
          transport,
          reason,
          status,
        });
        lastError = error;
        continue;
      }

      attempts.push({
        baseURL,
        transport,
        reason,
        status,
      });
      throw new ApiDiagnosticError(
        `ClearHear API request failed for ${method} ${path}`,
        {
          method,
          path,
          isMultipart,
          tokenAttached: tokenWasAttached,
          attempts,
        },
      );
    }
  }

  throw new ApiDiagnosticError(
    `Unable to reach the ClearHear API for ${method} ${path}`,
    {
      method,
      path,
      isMultipart,
      tokenAttached: tokenWasAttached,
      attempts,
    },
  );
}
