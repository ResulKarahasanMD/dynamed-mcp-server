import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { apiRequest, describeApiError } from "../services/client.js";
import type { SearchResponse, SearchResultItem } from "../types.js";
import { ResponseFormat, renderPayload, truncate } from "../utils/format.js";

const SEARCH_FIELDS = ["title", "pubType", "description", "sections", "metadata", "toc"] as const;
const FILTER_FIELDS = ["pubTypeId", "pubTypeGroup", "pubTypePretty"] as const;
const AGGREGATION_FIELDS = ["pubType.group", "pubType.id", "pubType.pretty"] as const;

const inputShape = {
  query: z
    .string()
    .min(1, "query must not be empty")
    .max(500, "query must not exceed 500 characters")
    .describe("Clinical search term, e.g. 'atrial fibrillation anticoagulation'"),
  page: z.number().int().min(1).default(1).describe("1-based page number"),
  page_size: z.number().int().min(1).max(50).default(10).describe("Results per page (1-50)"),
  fields: z
    .array(z.enum(SEARCH_FIELDS))
    .default(["title", "description", "pubType"])
    .describe(
      "Fields to return per result. 'sections' and 'toc' add a lot of text — request them only when needed.",
    ),
  filters: z
    .array(
      z.object({
        field: z.enum(FILTER_FIELDS).describe("Field to filter on"),
        values: z.array(z.string()).min(1).describe("Accepted values for that field"),
      }),
    )
    .optional()
    .describe("Narrow results by publication type. Discover valid values via 'aggregations' first."),
  aggregations: z
    .array(z.enum(AGGREGATION_FIELDS))
    .optional()
    .describe("Return result counts grouped by publication type, useful for discovering filters"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("'markdown' for human-readable output, 'json' for machine-readable"),
};

const outputShape = {
  query: z.string(),
  query_used: z.string().optional(),
  page: z.number(),
  page_size: z.number(),
  total_items: z.number(),
  total_pages: z.number(),
  count: z.number(),
  has_more: z.boolean(),
  next_page: z.number().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      pub_type: z.string().optional(),
      exact_match: z.boolean().optional(),
      media_type: z.string().optional(),
    }),
  ),
  aggregations: z
    .array(z.object({ field: z.string(), counts: z.record(z.string(), z.number()) }))
    .optional(),
};

type SearchInput = z.infer<z.ZodObject<typeof inputShape>>;

/** API bazen tekil obje, bazen dizi donuyor; ikisini de diziye normalize et. */
function normalizeItems(items: SearchResponse["items"]): SearchResultItem[] {
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") return [items];
  return [];
}

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    "dynamed_search",
    {
      title: "Search DynaMed",
      description: `Search DynaMed clinical reference content (topics, drug monographs, images, videos) by keyword.

This is the entry point for almost every DynaMed workflow: it returns article ids and slugs that
dynamed_get_article / dynamed_get_article_by_slug then use to fetch full content. It only reads
content; it never modifies anything.

Args:
  - query (string, required): clinical search term, e.g. "community acquired pneumonia treatment"
  - page (number): 1-based page number (default 1)
  - page_size (number): results per page, 1-50 (default 10)
  - fields (string[]): any of title, pubType, description, sections, metadata, toc
      (default ["title","description","pubType"]). 'sections'/'toc' return large text blocks.
  - filters (object[]): [{ field: "pubTypeId"|"pubTypeGroup"|"pubTypePretty", values: string[] }]
  - aggregations (string[]): any of "pubType.group", "pubType.id", "pubType.pretty" — returns
      result counts per publication type, which is how you discover valid filter values
  - response_format ('markdown'|'json'): output format (default 'markdown')

Returns (json format):
  {
    "query": string, "query_used": string, "page": number, "page_size": number,
    "total_items": number, "total_pages": number, "count": number,
    "has_more": boolean, "next_page": number,
    "items": [{ "id": string, "title": string, "slug": string, "description": string,
                "pub_type": string, "exact_match": boolean, "media_type": string }],
    "aggregations": [{ "field": string, "counts": { "<value>": number } }]
  }

Examples:
  - "What does DynaMed say about heart failure?" -> query="heart failure"
  - "Only drug monographs about metformin" -> query="metformin", aggregations=["pubType.pretty"]
    to see available types, then re-run with the matching filter
  - Don't use when: you already have an article id -> use dynamed_get_article instead

Error handling:
  - "No results found for '<query>'" when the search returns nothing — try broader terms
  - HTTP 403 means your EBSCO subscription does not cover the configured product`,
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SearchInput) => {
      try {
        const body: Record<string, unknown> = {
          query: params.query,
          page: params.page,
          pageSize: params.page_size,
          fields: params.fields,
        };
        if (params.filters?.length) body.filters = params.filters;
        if (params.aggregations?.length) body.aggregations = params.aggregations;

        const data = await apiRequest<SearchResponse>({
          method: "POST",
          path: "/v2/content/search",
          body,
        });

        const rawItems = normalizeItems(data.items);
        const meta = data._metadata ?? {};
        const totalItems = meta.totalItems ?? rawItems.length;
        const totalPages = meta.totalPages ?? 1;

        if (rawItems.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for '${params.query}'. Try broader or alternative clinical terms, or use dynamed_suggest to find valid topic titles.`,
              },
            ],
          };
        }

        const items = rawItems.map((item) => ({
          id: item.id ?? "",
          ...(item.title ? { title: item.title } : {}),
          ...(item.slug ? { slug: item.slug } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.pubType?.pretty || item.pubType?.id
            ? { pub_type: item.pubType.pretty ?? item.pubType.id }
            : {}),
          ...(typeof item.exactMatch === "boolean" ? { exact_match: item.exactMatch } : {}),
          ...(item.mediaType ? { media_type: item.mediaType } : {}),
        }));

        const hasMore = params.page < totalPages;
        const output = {
          query: params.query,
          ...(meta.queryUsed ? { query_used: meta.queryUsed } : {}),
          page: meta.page ?? params.page,
          page_size: meta.pageSize ?? params.page_size,
          total_items: totalItems,
          total_pages: totalPages,
          count: items.length,
          has_more: hasMore,
          ...(hasMore ? { next_page: params.page + 1 } : {}),
          items,
          ...(data.aggregations?.length
            ? {
                aggregations: data.aggregations.map((agg) => ({
                  field: agg.field ?? "",
                  counts: agg.counts ?? {},
                })),
              }
            : {}),
        };

        const lines = [
          `# DynaMed search: "${params.query}"`,
          "",
          `${totalItems} result(s) — page ${output.page} of ${totalPages}, showing ${items.length}.`,
          "",
        ];
        for (const item of items) {
          lines.push(`## ${item.title ?? "(untitled)"}`);
          lines.push(`- **id**: \`${item.id}\`${item.slug ? ` · **slug**: \`${item.slug}\`` : ""}`);
          if (item.pub_type) lines.push(`- **type**: ${item.pub_type}`);
          if (item.description) lines.push(`- ${item.description}`);
          lines.push("");
        }
        if (output.aggregations) {
          lines.push("## Publication type counts");
          for (const agg of output.aggregations) {
            const pairs = Object.entries(agg.counts)
              .map(([key, value]) => `${key} (${value})`)
              .join(", ");
            lines.push(`- **${agg.field}**: ${pairs || "none"}`);
          }
          lines.push("");
        }
        if (hasMore) lines.push(`More results available — call again with page=${params.page + 1}.`);

        const rendered = renderPayload(params.response_format, lines.join("\n"), output);
        const { text } = truncate(
          rendered,
          "Reduce 'page_size', drop 'sections'/'toc' from 'fields', or add 'filters'.",
        );

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: describeApiError(error, `search '${params.query}'`) },
          ],
        };
      }
    },
  );
}
