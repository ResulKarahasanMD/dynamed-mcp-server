/**
 * DynaMed madde bolumleri HTML olarak gelir. Ham HTML agent context'ini
 * gereksiz doldurdugu icin okunabilir duz metne cevriliyor.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "'",
  lsquo: "'",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  deg: "°",
  plusmn: "±",
  times: "×",
  le: "≤",
  ge: "≥",
  micro: "µ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  mu: "μ",
  plus: "+",
  minus: "−",
  ne: "≠",
  asymp: "≈",
  frac12: "½",
  sup2: "²",
  sup3: "³",
  middot: "·",
  bull: "•",
  rarr: "→",
  larr: "←",
  reg: "®",
  copy: "©",
  trade: "™",
  sect: "§",
  dagger: "†",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    // Varlik adlari rakam da icerebilir (frac12, sup2), bu yuzden [a-z0-9] gerekli.
    .replace(
      /&([a-z][a-z0-9]*);/gi,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

/**
 * HTML parcasini markdown'a yakin duz metne cevirir.
 * Basliklar, liste ogeleri ve paragraf siniri korunur.
 */
export function htmlToText(html: string): string {
  if (!html) return "";

  let text = html
    // Icerik tasimayan bloklari tumuyle at.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Basliklari markdown baslik isaretine cevir.
    .replace(/<h([1-6])\b[^>]*>/gi, (_, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, "\n")
    // Liste ogeleri.
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    // Satir ve blok sinirlari.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|section|ul|ol|table|blockquote)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    // Kalan tum etiketleri kaldir.
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
