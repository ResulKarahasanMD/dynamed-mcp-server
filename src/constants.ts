/**
 * EBSCO MedsAPI icin sabitler.
 * Kaynak: https://developer.ebsco.com/medical-point-care-apis/dynamed
 */

/** OAuth 2.0 client_credentials token uc noktasi (her iki urun icin ortak). */
export const AUTH_URL = "https://apis.ebsco.com/medsapi-auth/v1/token";

/** Urune gore icerik API taban adresleri. */
export const PRODUCT_BASE_URLS = {
  dynamed: "https://apis.ebsco.com/medsapi-dynamed",
  dynamedex: "https://apis.ebsco.com/medsapi-dynamedex",
} as const;

export type Product = keyof typeof PRODUCT_BASE_URLS;

/** Tek bir arac cevabinin asamayacagi karakter siniri (agent context'ini korur). */
export const CHARACTER_LIMIT = 25_000;

/** HTTP istekleri icin zaman asimi. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Token'i suresi dolmadan bu kadar saniye once yenile. */
export const TOKEN_EXPIRY_SAFETY_MARGIN_S = 60;
