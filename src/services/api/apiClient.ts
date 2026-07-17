import { API_URL, getAuthHeaders } from "./config";
import { tokenManager } from "./tokenManager";

export const UNAUTHORIZED_EVENT = "po-bunker:unauthorized";

interface ApiRequestOptions extends RequestInit {
  errorFallback?: string;
}

const extractErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || fallback;
  } catch {
    return text;
  }
};

const buildRequestInit = (options: RequestInit): RequestInit => {
  const token = tokenManager.getToken();
  if (!token) {
    throw new Error("No access token found");
  }

  return {
    ...options,
    headers: {
      ...getAuthHeaders(token),
      ...options.headers,
    },
  };
};

const handleUnauthorized = () => {
  tokenManager.removeToken();
  tokenManager.clearUser();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
};

const request = async (
  path: string,
  { errorFallback = "Request failed", ...init }: ApiRequestOptions,
): Promise<Response> => {
  const response = await fetch(`${API_URL}${path}`, buildRequestInit(init));

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error("Unauthorized. Please login again.");
    }
    throw new Error(await extractErrorMessage(response, errorFallback));
  }

  return response;
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> => {
  const response = await request(path, options);
  return response.json() as Promise<T>;
};

export const apiRequestBinary = async (
  path: string,
  options: ApiRequestOptions = {},
): Promise<ArrayBuffer> => {
  const response = await request(path, options);
  return response.arrayBuffer();
};

export const apiRequestVoid = async (
  path: string,
  options: ApiRequestOptions = {},
): Promise<void> => {
  await request(path, options);
};
