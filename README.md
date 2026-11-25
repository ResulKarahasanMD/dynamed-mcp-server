# dynamed-mcp-server

> **English summary.** An MCP server (stdio) for DynaMed and DynaMedex clinical reference content through EBSCO's official MedsAPI. It needs OAuth client credentials tied to your institution's subscription and does not scrape the web interface. Four read-only tools: search, suggest, and article retrieval by id or slug.
> This is an unofficial client and is not affiliated with EBSCO or DynaMed; you need a valid institutional or individual subscription. Calls against the live API with real credentials have not been verified in this release.
> The rest of this README is in Turkish.

> **Not.** Bu, resmî olmayan bir istemcidir; EBSCO ve DynaMed ile bağlantısı yoktur. Kullanmak için geçerli bir kurumsal ya da bireysel abonelik ve ona bağlı API kimlik bilgileri gerekir.
>
> Gerçek kimlik bilgisiyle API çağrısı bu sürümde doğrulanmadı: derleme, araç listesi ve girdi doğrulaması sınandı, canlı yanıtlar sınanmadı.

EBSCO **MedsAPI** üzerinden DynaMed / DynaMedex klinik referans içeriğine erişim sağlayan bir MCP sunucusu.

Resmî API dokümantasyonu: <https://developer.ebsco.com/medical-point-care-apis/dynamed>

---

## Ön koşul: EBSCO API kimlik bilgileri

Bu sunucu web arayüzünü kazımaz — EBSCO'nun resmî API'sini kullanır. Çalışması için kurumunuzun
DynaMed aboneliğine bağlı OAuth 2.0 istemci kimlik bilgileri gerekir:

1. <https://developer.ebsco.com/> adresinde geliştirici hesabı oluşturun.
2. Bir *client application* kaydedin.
3. Size verilen `client_id` ve `client_secret` değerlerini alın.

> Kurumsal aboneliğiniz API erişimini kapsamıyorsa EBSCO temsilcinizle veya kütüphanenizle
> görüşmeniz gerekir. Kimlik bilgileri olmadan sunucu başlamaz.

---

## Kurulum

```bash
cd dynamed-mcp-server
npm install
npm run build
```

## Yapılandırma

Ortam değişkenleri (`.env.example` dosyasına bakın):

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `EBSCO_CLIENT_ID` | evet | EBSCO OAuth 2.0 istemci kimliği |
| `EBSCO_CLIENT_SECRET` | evet | EBSCO OAuth 2.0 istemci sırrı |
| `DYNAMED_PRODUCT` | hayır | `dynamed` (varsayılan) veya `dynamedex` |

`dynamedex`, DynaMed + Micromedex birleşik içeriğidir; yalnızca o ürüne aboneyseniz kullanın.

## Claude Code'a ekleme

```bash
claude mcp add dynamed \
  --env EBSCO_CLIENT_ID=your_client_id \
  --env EBSCO_CLIENT_SECRET=your_client_secret \
  --env DYNAMED_PRODUCT=dynamed \
  -- node /path/to/dynamed-mcp-server/dist/index.js
```

Ya da bir `.mcp.json` / `claude_desktop_config.json` içine elle:

```json
{
  "mcpServers": {
    "dynamed": {
      "command": "node",
      "args": ["/path/to/dynamed-mcp-server/dist/index.js"],
      "env": {
        "EBSCO_CLIENT_ID": "your_client_id",
        "EBSCO_CLIENT_SECRET": "your_client_secret",
        "DYNAMED_PRODUCT": "dynamed"
      }
    }
  }
}
```

---

## Araçlar

Dört araç da salt okunurdur (`readOnlyHint: true`); hiçbiri içerik değiştirmez.

### `dynamed_search`

Anahtar kelimeyle DynaMed içeriğinde arama yapar. Neredeyse her akışın başlangıç noktasıdır —
diğer araçların ihtiyaç duyduğu `id` ve `slug` değerlerini döndürür.

- `query` (zorunlu), `page`, `page_size` (1–50), `fields`, `filters`, `aggregations`, `response_format`
- Yayın türüne göre daraltmak için önce `aggregations` ile mevcut türleri görün, sonra `filters` uygulayın.

### `dynamed_suggest`

Kısmi/yanlış yazılmış terimleri DynaMed'in kullandığı gerçek başlıklara çevirir (otomatik tamamlama).
Başlık önerileri `id` ve `slug` da taşıdığı için doğrudan madde çekmeye geçilebilir.

- `query` (zorunlu), `suggestion_types` (`title` / `term`), `max_per_type`, `response_format`

### `dynamed_get_article` / `dynamed_get_article_by_slug`

Bir maddeyi `id` veya `slug` ile getirir; HTML içeriği okunabilir düz metne çevrilir.

- `article_id` **veya** `slug` (zorunlu), `section_anchors`, `toc_only`, `response_format`

**Önerilen akış** — DynaMed konuları çok uzundur, tamamını çekmek bağlamı boşa harcar:

1. `dynamed_search` → maddenin `id`'sini al
2. `dynamed_get_article` (`toc_only: true`) → bölüm listesini ve `anchor` değerlerini gör
3. `dynamed_get_article` (`section_anchors: ["treatment"]`) → yalnızca gereken bölümü çek

---

## Tasarım notları

- **Bağlam yönetimi.** Tüm cevaplar 25.000 karakterle sınırlıdır. Sınır aşılırsa cevap kesilir ve
  modele nasıl daraltacağı (sayfa boyutu, alan seçimi, bölüm seçimi) açıkça söylenir.
- **Token önbelleği.** Access token süresi dolana kadar (60 sn güvenlik payıyla) yeniden kullanılır.
  Eşzamanlı istekler tek bir token çağrısını paylaşır. HTTP 401 alınırsa token bir kez tazelenip
  istek tekrarlanır.
- **Hata mesajları.** 401/403/404/429 durumları, modelin ne yapması gerektiğini söyleyen mesajlara
  çevrilir (ör. 404 → "id'yi tahmin etme, `dynamed_search` sonuçlarından al").
- **Çıktı biçimi.** Her araç hem `markdown` (okunabilir) hem `json` (işlenebilir) döndürebilir;
  ayrıca `outputSchema` ile `structuredContent` sağlanır.

## Geliştirme

```bash
npm run dev     # tsx watch ile canlı yeniden yükleme
npm run build   # tsc + dist/index.js
npm start       # derlenmiş sunucuyu çalıştır
```

MCP Inspector ile denemek için:

```bash
EBSCO_CLIENT_ID=... EBSCO_CLIENT_SECRET=... npx @modelcontextprotocol/inspector node dist/index.js
```

## Lisans ve içerik kullanımı

Kod [MIT](LICENSE) lisanslıdır. Bu proje EBSCO ve DynaMed ile bağlantılı değildir.

Bu sunucu yalnızca bir API istemcisidir. DynaMed içeriği EBSCO'ya aittir ve kurumunuzun abonelik
şartlarına tabidir. İçeriğin saklanması, yeniden dağıtılması veya abonelik dışına çıkarılması
konusunda kurumunuzun lisans koşullarına uyun.
