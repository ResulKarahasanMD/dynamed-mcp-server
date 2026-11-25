import { PRODUCT_BASE_URLS, type Product } from "./constants.js";

export interface ServerConfig {
  clientId: string;
  clientSecret: string;
  product: Product;
  baseUrl: string;
}

/**
 * Ortam degiskenlerinden yapilandirmayi okur.
 * Modul yuklenirken degil, cagrildiginda okunur; boylece sunucu once baslar
 * ve eksik kimlik bilgisi durumunda anlasilir bir hata verebilir.
 */
export function getConfig(): ServerConfig {
  const clientId = process.env.EBSCO_CLIENT_ID?.trim();
  const clientSecret = process.env.EBSCO_CLIENT_SECRET?.trim();
  const rawProduct = (process.env.DYNAMED_PRODUCT ?? "dynamed").trim().toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing credentials: set EBSCO_CLIENT_ID and EBSCO_CLIENT_SECRET. " +
        "Register a client application at https://developer.ebsco.com/ to obtain them.",
    );
  }

  if (!(rawProduct in PRODUCT_BASE_URLS)) {
    throw new Error(
      `Invalid DYNAMED_PRODUCT '${rawProduct}'. Must be one of: ${Object.keys(PRODUCT_BASE_URLS).join(", ")}.`,
    );
  }

  const product = rawProduct as Product;
  return { clientId, clientSecret, product, baseUrl: PRODUCT_BASE_URLS[product] };
}
