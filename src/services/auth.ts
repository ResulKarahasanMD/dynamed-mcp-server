import axios from "axios";

import { getConfig } from "../config.js";
import { AUTH_URL, REQUEST_TIMEOUT_MS, TOKEN_EXPIRY_SAFETY_MARGIN_S } from "../constants.js";
import type { TokenResponse } from "../types.js";

interface CachedToken {
  token: string;
  /** Epoch milisaniye cinsinden gecerlilik bitisi. */
  expiresAt: number;
}

let cached: CachedToken | null = null;
/** Es zamanli isteklerin ayni anda token istemesini engeller. */
let inFlight: Promise<string> | null = null;

/**
 * Gecerli bir access token dondurur; onbellekte varsa onu kullanir.
 * @param forceRefresh true ise onbellek yok sayilip yeni token alinir (401 sonrasi).
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }
  if (forceRefresh) {
    cached = null;
  }
  // Ayni anda birden fazla istek gelirse tek bir token cagrisini paylassinlar.
  inFlight ??= requestToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function requestToken(): Promise<string> {
  const { clientId, clientSecret, product } = getConfig();

  try {
    const response = await axios.post<TokenResponse>(
      AUTH_URL,
      {
        grant_type: "client_credentials",
        product,
        client_id: clientId,
        client_secret: clientSecret,
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      },
    );

    const token = response.data?.access_token;
    if (!token) {
      throw new Error("Token endpoint returned no access_token.");
    }

    // expires_in string olarak gelir; guvenlik payi birakarak onbellege al.
    const expiresInSeconds = Number.parseInt(response.data.expires_in ?? "", 10);
    const lifetime = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 1800;
    const effective = Math.max(lifetime - TOKEN_EXPIRY_SAFETY_MARGIN_S, 30);
    cached = { token, expiresAt: Date.now() + effective * 1000 };

    return token;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        throw new Error(
          `Authentication failed (HTTP ${status}). Check EBSCO_CLIENT_ID / EBSCO_CLIENT_SECRET, ` +
            `and confirm your organization's subscription covers DYNAMED_PRODUCT='${getConfig().product}'.`,
        );
      }
      throw new Error(`Token request failed with HTTP ${status}.`);
    }
    throw error;
  }
}

/** Test/teshis amacli onbellegi temizler. */
export function clearTokenCache(): void {
  cached = null;
}
