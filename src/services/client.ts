import axios, { type AxiosRequestConfig, type Method } from "axios";

import { getConfig } from "../config.js";
import { REQUEST_TIMEOUT_MS } from "../constants.js";
import { getAccessToken } from "./auth.js";

interface RequestOptions {
  method: Method;
  /** Taban adrese eklenecek yol, basinda "/" ile. Ornek: "/v2/content/search" */
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined>;
}

/**
 * MedsAPI'ye kimlik dogrulamali istek atar.
 * Token suresi dolduysa (401) bir kez yeni token alip istegi tekrarlar.
 */
export async function apiRequest<T>(options: RequestOptions): Promise<T> {
  const { baseUrl } = getConfig();

  const send = async (token: string): Promise<T> => {
    const config: AxiosRequestConfig = {
      method: options.method,
      url: `${baseUrl}${options.path}`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(options.body !== undefined ? { data: options.body } : {}),
      ...(options.query ? { params: options.query } : {}),
      // Dizi parametreleri API'nin bekledigi sekilde tekrarlanan anahtar olarak gonderilir.
      paramsSerializer: { indexes: null },
    };
    const response = await axios.request<T>(config);
    return response.data;
  };

  const token = await getAccessToken();
  try {
    return await send(token);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Token beklenenden erken gecersiz olmus olabilir; bir kez tazeleyip tekrar dene.
      const fresh = await getAccessToken(true);
      return await send(fresh);
    }
    throw error;
  }
}

/**
 * Hatalari agent'in ne yapacagini anlayabilecegi mesajlara cevirir.
 */
export function describeApiError(error: unknown, context: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          return `Error: Invalid request for ${context}. Check parameter values (HTTP 400).`;
        case 401:
          return "Error: Authentication failed. Verify EBSCO_CLIENT_ID and EBSCO_CLIENT_SECRET are valid.";
        case 403:
          return `Error: Access denied for ${context}. Your subscription may not include this content or product (HTTP 403).`;
        case 404:
          return `Error: Not found for ${context}. Verify the article id or slug — obtain them from dynamed_search results rather than guessing.`;
        case 429:
          return "Error: Rate limit exceeded. Wait a few seconds before retrying.";
        default:
          if (status >= 500) {
            return `Error: DynaMed API is unavailable (HTTP ${status}). Retry shortly.`;
          }
          return `Error: Request for ${context} failed with HTTP ${status}.`;
      }
    }
    if (error.code === "ECONNABORTED") {
      return `Error: Request for ${context} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Retry, or narrow the request.`;
    }
    return `Error: Network failure while contacting the DynaMed API (${error.code ?? "unknown"}).`;
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
