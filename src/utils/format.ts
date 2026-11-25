import { CHARACTER_LIMIT } from "../constants.js";
import type { ArticleSection, TocEntry } from "../types.js";
import { htmlToText } from "./html.js";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Duzlestirilmis bir madde bolumu. */
export interface FlatSection {
  anchor: string;
  title: string;
  /** Ic ice bolumlerde derinlik (0 = ust duzey). */
  depth: number;
  text: string;
}

/**
 * Ic ice gecmis bolum agacini duz bir listeye cevirir.
 * Boylece agent tek tek bolum secebilir ve karakter sayisi olculebilir.
 */
export function flattenSections(sections: ArticleSection[] | undefined, depth = 0): FlatSection[] {
  if (!Array.isArray(sections)) return [];

  const out: FlatSection[] = [];
  for (const section of sections) {
    const anchor = section.anchor ?? "";
    const title = section.title ?? "(untitled section)";
    const text = typeof section.content === "string" ? htmlToText(section.content) : "";
    if (anchor || title || text) {
      out.push({ anchor, title, depth, text });
    }
    out.push(...flattenSections(section.sections, depth + 1));
  }
  return out;
}

/** Icindekiler agacini girintili markdown listesine cevirir. */
export function renderToc(toc: TocEntry[] | undefined, depth = 0): string[] {
  if (!Array.isArray(toc)) return [];

  const lines: string[] = [];
  for (const entry of toc) {
    const indent = "  ".repeat(depth);
    const anchor = entry.anchor ? ` \`${entry.anchor}\`` : "";
    lines.push(`${indent}- ${entry.title ?? "(untitled)"}${anchor}`);
    lines.push(...renderToc(entry.sections, depth + 1));
  }
  return lines;
}

/** Toc yoksa bolumlerin kendisinden bir icindekiler uretir. */
export function tocFromSections(sections: FlatSection[]): string[] {
  return sections.map((s) => `${"  ".repeat(s.depth)}- ${s.title} \`${s.anchor}\``);
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
  message?: string;
}

/**
 * Metni karakter sinirinda keser ve agent'a nasil daraltacagini soyler.
 */
export function truncate(text: string, hint: string, limit = CHARACTER_LIMIT): TruncationResult {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  const message =
    `[Response truncated: ${text.length} characters exceeded the ${limit}-character limit. ${hint}]`;
  // Kesme payini birakarak mesajin da sigmasini garanti et.
  const body = text.slice(0, Math.max(0, limit - message.length - 2));
  return { text: `${body}\n\n${message}`, truncated: true, message };
}

/** Markdown/JSON secimine gore metin govdesini uretir. */
export function renderPayload(
  format: ResponseFormat,
  markdown: string,
  payload: unknown,
): string {
  return format === ResponseFormat.JSON ? JSON.stringify(payload, null, 2) : markdown;
}
