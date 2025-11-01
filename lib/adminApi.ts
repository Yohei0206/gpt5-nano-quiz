const ADMIN_TOKEN_HEADER = "x-admin-token";

const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN;

export class AdminApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown, cause?: unknown) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "AdminApiError";
    this.status = status;
    this.details = details;
  }
}

type JsonResponse<T> = T extends void ? null : T;

interface AdminFetchOptions extends RequestInit {
  admin?: boolean;
}

function safeParse(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return `HTTP ${status}`;
}

async function requestJson<T = unknown>(
  path: string,
  options: AdminFetchOptions = {}
): Promise<JsonResponse<T>> {
  const { admin, headers: initHeaders, body, ...rest } = options;
  const headers = new Headers(initHeaders ?? undefined);

  if (
    body !== undefined &&
    body !== null &&
    typeof body === "string" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }

  if (admin && ADMIN_TOKEN && !headers.has(ADMIN_TOKEN_HEADER)) {
    headers.set(ADMIN_TOKEN_HEADER, ADMIN_TOKEN);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...rest, headers, body });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? `ネットワークエラー: ${error.message}`
        : "ネットワークエラーが発生しました";
    throw new AdminApiError(message, undefined, undefined, error);
  }

  const text = await response.text();
  const parsed = safeParse(text);

  if (!response.ok) {
    throw new AdminApiError(
      extractErrorMessage(parsed, response.status),
      response.status,
      parsed
    );
  }

  return parsed as JsonResponse<T>;
}

export async function getJson<T = unknown>(
  path: string,
  options: AdminFetchOptions = {}
): Promise<JsonResponse<T>> {
  return requestJson<T>(path, { ...options, method: "GET" });
}

export async function postJson<T = unknown, P = unknown>(
  path: string,
  payload: P,
  options: AdminFetchOptions = {}
): Promise<JsonResponse<T>> {
  return requestJson<T>(path, {
    ...options,
    method: options.method ?? "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminJson<T = unknown>(
  path: string,
  options: AdminFetchOptions = {}
): Promise<JsonResponse<T>> {
  return requestJson<T>(path, { ...options, method: "GET", admin: true });
}

export async function postAdminJson<T = unknown, P = unknown>(
  path: string,
  payload: P,
  options: AdminFetchOptions = {}
): Promise<JsonResponse<T>> {
  return requestJson<T>(path, {
    ...options,
    method: options.method ?? "POST",
    admin: true,
    body: JSON.stringify(payload),
  });
}

export function adminErrorMessage(
  error: unknown,
  fallback = "エラーが発生しました"
): string {
  if (error instanceof AdminApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function adminErrorDetails(error: unknown): unknown {
  return error instanceof AdminApiError ? error.details : undefined;
}
