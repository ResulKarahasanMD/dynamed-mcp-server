import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { apiRequest, describeApiError } from "../services/client.js";
import type { SuggestResponse } from "../types.js";
import { ResponseFormat, renderPayload, truncate } from "../utils/format.js";

const inputShape = {
  query: z
    .string()
    .min(1, "query must not be empty")
    .max(200, "query must not exceed 200 characters")
    .describe("Partial term to autocomplete, e.g. 'atrial fib'"),
  suggestion_types: z
    .array(z.enum(["title", "term"]))
    .optional()
    .describe("Limit to 'title' (topic titles) and/or 'term' (index terms). Default: both."),
  max_per_type: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum suggestions per type (default 10)"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("'markdown' for human-readable output, 'json' for machine-readable"),
};

const outputShape = {
  query: z.string(),
  total_items: z.number().optional(),
  groups: z.array(
    z.object({
      suggestion_type: z.string(),
      suggestions: z.array(
        z.object({
          phrase: z.string(),
          id: z.string().optional(),
          slug: z.string().optional(),
          title: z.string().optional(),
        }),
      ),
    }),
  ),
};

type SuggestInput = z.infer<z.ZodObject<typeof inputShape>>;

export function registerSuggestTool(server: McpServer): void {
  server.registerTool(
    "dynamed_suggest",
    {
      title: "Suggest DynaMed Topics",
      description: `Autocomplete DynaMed topic titles and index terms from a partial query.

Use this to resolve vague, abbreviated, or misspelled clinical phrasing into the exact topic titles
DynaMed uses, before running dynamed_search. Matched title suggestions also carry the article id and
slug, so a confident match can go straight to dynamed_get_article. Read-only.

Args:
  - query (string, required): partial term, e.g. "atrial fib"
  - suggestion_types (string[]): any of "title", "term" (default: both)
  - max_per_type (number): maximum suggestions per type, 1-50 (default 10)
  - response_format ('markdown'|'json'): output format (default 'markdown')

Returns (json format):
  {
    "query": string,
    "total_items": number,
    "groups": [{
      "suggestion_type": string,
      "suggestions": [{ "phrase": string, "id": string, "slug": string, "title": string }]
    }]
  }

Examples:
  - "What's the DynaMed topic for AF?" -> query="atrial fib"
  - "Fix my spelling of pneumothorax" -> query="pneumothorx"
  - Don't use when: you want article content -> use dynamed_search or dynamed_get_article

Error handling:
  - "No suggestions found for '<query>'" when nothing matches — try a shorter prefix`,
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SuggestInput) => {
      try {
        const data = await apiRequest<SuggestResponse>({
          method: "GET",
          path: "/v2/content/search/suggestions",
          query: {
            query: params.query,
            ...(params.suggestion_types?.length
              ? { suggestionType: params.suggestion_types.join(",") }
              : {}),
            maxItemsPerSuggestionType: params.max_per_type,
          },
        });

        const groups = (data.items ?? []).map((group) => ({
          suggestion_type: group.suggestionType ?? "unknown",
          suggestions: (group.suggestions ?? []).map((s) => ({
            phrase: s.completedPhrase ?? s.resource?.title ?? "",
            ...(s.resource?.id ? { id: s.resource.id } : {}),
            ...(s.resource?.slug ? { slug: s.resource.slug } : {}),
            ...(s.resource?.title ? { title: s.resource.title } : {}),
          })),
        }));

        const totalSuggestions = groups.reduce((sum, g) => sum + g.suggestions.length, 0);
        if (totalSuggestions === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No suggestions found for '${params.query}'. Try a shorter prefix or a different spelling.`,
              },
            ],
          };
        }

        const output = {
          query: params.query,
          ...(typeof data._metadata?.totalItems === "number"
            ? { total_items: data._metadata.totalItems }
            : {}),
          groups,
        };

        const lines = [`# DynaMed suggestions: "${params.query}"`, ""];
        for (const group of groups) {
          lines.push(`## ${group.suggestion_type}`);
          for (const suggestion of group.suggestions) {
            const ids = [
              suggestion.id ? `id: \`${suggestion.id}\`` : null,
              suggestion.slug ? `slug: \`${suggestion.slug}\`` : null,
            ].filter(Boolean);
            lines.push(`- ${suggestion.phrase}${ids.length ? ` — ${ids.join(" · ")}` : ""}`);
          }
          lines.push("");
        }

        const rendered = renderPayload(params.response_format, lines.join("\n"), output);
        const { text } = truncate(rendered, "Lower 'max_per_type' or narrow 'suggestion_types'.");

        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: describeApiError(error, `suggestions '${params.query}'`) },
          ],
        };
      }
    },
  );
}
