/**
 * EBSCO MedsAPI cevaplarinin tip tanimlari.
 * API ek alanlar donebilecegi icin tipler bilincli olarak gevsek tutuldu;
 * yalnizca gercekten kullandigimiz alanlar zorunlu isaretlendi.
 */

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  /** API bunu saniye cinsinden bir *string* olarak dondurur. */
  expires_in?: string;
  product?: string;
  scope?: string;
}

export interface ApiLink {
  rel?: string;
  href?: string;
  method?: string;
}

export interface SearchResultItem {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  pubType?: { id?: string; group?: string; pretty?: string };
  exactMatch?: boolean;
  mediaType?: "video" | "image";
  format?: string;
  links?: ApiLink[];
  sections?: unknown[];
  toc?: unknown[];
}

export interface SearchAggregation {
  field?: string;
  counts?: Record<string, number>;
}

export interface SearchResponse {
  _metadata?: {
    page?: number;
    pageSize?: number;
    totalItems?: number;
    totalPages?: number;
    query?: string;
    queryUsed?: string;
  };
  aggregations?: SearchAggregation[];
  /** Dokumantasyonda tekil obje gibi gorunse de pratikte dizi doner; ikisini de karsiliyoruz. */
  items?: SearchResultItem[] | SearchResultItem;
}

export interface TocEntry {
  anchor?: string;
  title?: string;
  sections?: TocEntry[];
}

export interface ArticleSection {
  anchor?: string;
  title?: string;
  content?: string;
  sections?: ArticleSection[];
}

export interface ArticleResponse {
  id?: string;
  title?: string;
  slug?: string;
  links?: ApiLink[];
  metadata?: Record<string, unknown>;
  toc?: TocEntry[];
  sections?: ArticleSection[];
  ancillary?: Record<string, unknown>;
}

export interface SuggestionResource {
  id?: string;
  slug?: string;
  title?: string;
  links?: ApiLink[];
}

export interface SuggestionGroup {
  suggestionType?: string;
  suggestions?: Array<{ completedPhrase?: string; resource?: SuggestionResource }>;
}

export interface SuggestResponse {
  _metadata?: { totalItems?: number; request?: { query?: string } };
  items?: SuggestionGroup[];
}
