#!/usr/bin/env node
/**
 * DynaMed MCP sunucusu.
 *
 * EBSCO MedsAPI (DynaMed / DynaMedex) uzerinden klinik referans icerigine
 * arama, oneri ve tam madde erisimi saglar.
 *
 * Kimlik dogrulama: OAuth 2.0 client_credentials.
 * Belgeler: https://developer.ebsco.com/medical-point-care-apis/dynamed
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getConfig } from "./config.js";
import { registerArticleTools } from "./tools/article.js";
import { registerSearchTool } from "./tools/search.js";
import { registerSuggestTool } from "./tools/suggest.js";

const server = new McpServer({ name: "dynamed-mcp-server", version: "1.0.0" });

registerSearchTool(server);
registerSuggestTool(server);
registerArticleTools(server);

async function main(): Promise<void> {
  // Kimlik bilgileri eksikse hemen, anlasilir bir hatayla dur.
  let product: string;
  try {
    product = getConfig().product;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport'ta stdout protokole ait; gunluk daima stderr'e yazilir.
  console.error(`dynamed-mcp-server running on stdio (product: ${product})`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
