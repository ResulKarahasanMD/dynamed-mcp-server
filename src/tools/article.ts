import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { apiRequest, describeApiError } from "../services/client.js";
import type { ArticleResponse } from "../types.js";
import {
  ResponseFormat,
  flattenSections,
  renderPayload,
  renderToc,
  tocFromSections,
  truncate,
  type FlatSection,
} from "../utils/format.js";

/** Iki aracin da paylastigi girdi alanlari. */
const commonInputShape = {
  section_anchors: z
    .array(z.string())
    .optional()
    .describe(
      "Return only these sections, by anchor. Get anchors from the table of contents (call once with toc_only=true first).",
    ),
  toc_only: z
    .boolean()
    .default(false)
    .describe("Return only metadata and the table of contents, with no section body text"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("'markdown' for human-readable output, 'json' for machine-readable"),
};

const outputShape = {
  id: z.string(),
  title: z.string().optional(),
  slug: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  toc: z.array(z.string()),
  sections: z.array(z.object({ anchor: z.string(), title: z.string(), text: z.string() })),
  total_sections: z.number(),
  returned_sections: z.number(),
  truncated: z.boolean(),
};

interface RenderParams {
  section_anchors?: string[] | undefined;
  toc_only: boolean;
  response_format: ResponseFormat;
}

/**
 * Madde cevabini agent dostu bir yapiya cevirir.
 * Tam metin cok buyuk oldugu icin varsayilan akis: once icindekiler, sonra secilen bolumler.
 */
function buildArticleResult(article: ArticleResponse, params: RenderParams) {
  const allSections = flattenSections(article.sections);
  const tocLines = renderToc(article.toc);
  const toc = tocLines.length > 0 ? tocLines : tocFromSections(allSections);

  let selected: FlatSection[];
  if (params.toc_only) {
    selected = [];
  } else if (params.section_anchors?.length) {
    const wanted = new Set(params.section_anchors);
    selected = allSections.filter((s) => wanted.has(s.anchor));
  } else {
    selected = allSections;
  }

  const sections = selected.map((s) => ({ anchor: s.anchor, title: s.title, text: s.text }));

  const markdownLines = [
    `# ${article.title ?? "(untitled)"}`,
    "",
    `- **id**: \`${article.id ?? ""}\`${article.slug ? ` · **slug**: \`${article.slug}\`` : ""}`,
    "",
    "## Table of contents",
    ...(toc.length > 0 ? toc : ["(no table of contents available)"]),
    "",
  ];

  if (params.toc_only) {
    markdownLines.push(
      `${allSections.length} section(s) available. Call again with section_anchors=[...] to fetch specific ones.`,
    );
  } else if (params.section_anchors?.length && sections.length === 0) {
    markdownLines.push(
      `None of the requested anchors matched. Available anchors: ${allSections
        .map((s) => `\`${s.anchor}\``)
        .join(", ")}`,
    );
  } else {
    for (const section of sections) {
      markdownLines.push(`## ${section.title}${section.anchor ? ` \`${section.anchor}\`` : ""}`);
      markdownLines.push(section.text || "(empty section)");
      markdownLines.push("");
    }
  }

  const baseOutput = {
    id: article.id ?? "",
    ...(article.title ? { title: article.title } : {}),
    ...(article.slug ? { slug: article.slug } : {}),
    ...(article.metadata ? { metadata: article.metadata } : {}),
    toc,
    sections,
    total_sections: allSections.length,
    returned_sections: sections.length,
  };

  const rendered = renderPayload(params.response_format, markdownLines.join("\n"), {
    ...baseOutput,
    truncated: false,
  });
  const { text, truncated } = truncate(
    rendered,
    "Call again with toc_only=true to list sections, then request specific section_anchors.",
  );

  return { text, output: { ...baseOutput, truncated } };
}

function articleDescription(kind: "id" | "slug", identifierExample: string): string {
  return `Retrieve a full DynaMed article by its ${kind}, converted from HTML to readable text.

DynaMed topics are long. The recommended workflow is: dynamed_search to get the ${kind} ->
call this tool with toc_only=true to see the section list -> call again with section_anchors
for the sections you actually need. Read-only; nothing is modified.

Args:
  - ${kind === "id" ? "article_id" : "slug"} (string, required): e.g. "${identifierExample}"
  - section_anchors (string[]): return only these sections (anchors come from the table of contents)
  - toc_only (boolean): return metadata + table of contents only, no body text (default false)
  - response_format ('markdown'|'json'): output format (default 'markdown')

Returns (json format):
  {
    "id": string, "title": string, "slug": string,
    "metadata": object,
    "toc": string[],
    "sections": [{ "anchor": string, "title": string, "text": string }],
    "total_sections": number, "returned_sections": number, "truncated": boolean
  }

Examples:
  - "Summarize the treatment section of this topic" -> toc_only=true, then section_anchors=["treatment"]
  - "Give me the whole topic" -> call with no section_anchors (may be truncated)
  - Don't use when: you don't have an ${kind} yet -> use dynamed_search first

Error handling:
  - HTTP 404 means the ${kind} is wrong — take ${kind}s from dynamed_search results, never guess them
  - If requested anchors match nothing, the response lists the available anchors`;
}

export function registerArticleTools(server: McpServer): void {
  server.registerTool(
    "dynamed_get_article",
    {
      title: "Get DynaMed Article by ID",
      description: articleDescription("id", "T116814"),
      inputSchema: {
        article_id: z
          .string()
          .min(1, "article_id must not be empty")
          .describe("DynaMed article id from dynamed_search results, e.g. 'T116814'"),
        ...commonInputShape,
      },
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const article = await apiRequest<ArticleResponse>({
          method: "GET",
          path: `/v2/content/articles/${encodeURIComponent(params.article_id)}`,
        });
        const { text, output } = buildArticleResult(article, params);
        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: describeApiError(error, `article id '${params.article_id}'`),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "dynamed_get_article_by_slug",
    {
      title: "Get DynaMed Article by Slug",
      description: articleDescription("slug", "/condition/acute-heart-failure"),
      inputSchema: {
        slug: z
          .string()
          .min(1, "slug must not be empty")
          .describe(
            "URL-friendly topic slug from dynamed_search results, e.g. '/condition/acute-heart-failure'",
          ),
        ...commonInputShape,
      },
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // Slug bolu isareti iceriyor; yol parcasi olarak gecmesi icin bastaki "/" atilip
        // her segment ayri ayri kodlanir.
        const encodedSlug = params.slug
          .replace(/^\/+/, "")
          .split("/")
          .map(encodeURIComponent)
          .join("/");

        const article = await apiRequest<ArticleResponse>({
          method: "GET",
          path: `/v2/content/slugs/${encodedSlug}`,
        });
        const { text, output } = buildArticleResult(article, params);
        return { content: [{ type: "text" as const, text }], structuredContent: output };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: describeApiError(error, `slug '${params.slug}'`) },
          ],
        };
      }
    },
  );
}
