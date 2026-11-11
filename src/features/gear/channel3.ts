import { z } from "zod";

// Channel3 (https://trychannel3.com): one product-search API over many online
// retailers. Tripweave only *links out* to what it finds: Channel3 checkout is
// not available yet, and gear is never part of the Trip Order or its PayPal
// payment. Without CHANNEL3_API_KEY the feature is simply off.

const SEARCH_URL = "https://api.trychannel3.com/v1/search";
const SIMILAR_URL = "https://api.trychannel3.com/v1/similar";

/** Shown wherever Channel3 links are, as Channel3's terms require. */
export const AFFILIATE_DISCLOSURE = "We may earn a commission when you buy through links on this page.";

export type GearProduct = {
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  /** The cheapest in-stock USD offer at or under the cap, in cents. */
  priceMinorUnits: number;
  /** The retailer's pre-discount price, when it is on sale. */
  compareAtMinorUnits: number | null;
  url: string;
  domain: string;
};

export class Channel3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "Channel3Error";
  }
}

export function channel3Configured(): boolean {
  return Boolean(process.env.CHANNEL3_API_KEY);
}

// Only the fields this app reads; everything else Channel3 sends is dropped.
const offerSchema = z.object({
  url: z.string(),
  domain: z.string(),
  price: z.object({ price: z.number(), compare_at_price: z.number().nullish(), currency: z.string() }),
  availability: z.string(),
});
const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  brands: z.array(z.object({ name: z.string() })).nullish(),
  images: z.array(z.object({ url: z.string(), cleaned_url: z.string().nullish(), is_main_image: z.boolean().nullish() })).nullish(),
  offers: z.array(offerSchema).nullish(),
});
const searchResponseSchema = z.object({ products: z.array(z.unknown()) });

const cents = (dollars: number) => Math.round(dollars * 100);
const isHttps = (url: string) => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Turns one Channel3 product into what the trip page shows, or null when it
 * has no offer the traveller could actually buy within the cap: in stock,
 * priced in USD, at or under the cap, on an https link.
 */
export function toGearProduct(raw: unknown, capMinorUnits: number): GearProduct | null {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return null;
  const product = parsed.data;
  const offers = (product.offers ?? [])
    .filter((offer) => offer.availability === "InStock" && offer.price.currency === "USD" && isHttps(offer.url))
    .map((offer) => ({ ...offer, minor: cents(offer.price.price) }))
    .filter((offer) => offer.minor > 0 && offer.minor <= capMinorUnits)
    .sort((a, b) => a.minor - b.minor);
  const best = offers[0];
  if (!best) return null;
  const images = product.images ?? [];
  const image = images.find((img) => img.is_main_image) ?? images[0];
  const imageUrl = image ? (image.cleaned_url ?? image.url) : null;
  const compareAt = best.price.compare_at_price ? cents(best.price.compare_at_price) : null;
  return {
    id: product.id,
    title: product.title,
    brand: product.brands?.[0]?.name ?? null,
    imageUrl: imageUrl && isHttps(imageUrl) ? imageUrl : null,
    priceMinorUnits: best.minor,
    compareAtMinorUnits: compareAt && compareAt > best.minor ? compareAt : null,
    url: best.url,
    domain: best.domain,
  };
}

/**
 * Searches US retailers for in-stock products at or under `capMinorUnits`.
 * Channel3 doesn't serve every country (Japan, Indonesia aren't covered), so
 * the store is always US / USD: the gear ships before the trip.
 */
export async function searchGear(
  query: string,
  capMinorUnits: number,
  deps: { apiKey?: string; fetch?: typeof fetch; limit?: number } = {},
): Promise<GearProduct[]> {
  const apiKey = deps.apiKey ?? process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Channel3Error("CHANNEL3_API_KEY is not configured.", 503);
  const response = await (deps.fetch ?? fetch)(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      limit: 8,
      filters: { price: { max_price: capMinorUnits / 100 }, availability: ["InStock"], conditions: ["new"] },
      config: { country: "US", currency: "USD" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // 401 bad key, 402 out of credits, 422 bad request: none worth retrying.
    console.error("Channel3 search failed", response.status, await response.text().catch(() => ""));
    throw new Channel3Error(`Channel3 search failed (${response.status}).`, response.status);
  }
  const body = searchResponseSchema.parse(await response.json());
  return pickProducts(body.products, capMinorUnits, { limit: deps.limit ?? 3, context: { query } });
}

/**
 * Products Channel3 ranks closest to one it returned before (/v1/similar),
 * held to the same cap: "more like this" for a gear pick, never pricier than
 * the kit allows. The source product itself is left out.
 */
export async function similarGear(
  productId: string,
  capMinorUnits: number,
  deps: { apiKey?: string; fetch?: typeof fetch; limit?: number } = {},
): Promise<GearProduct[]> {
  const apiKey = deps.apiKey ?? process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Channel3Error("CHANNEL3_API_KEY is not configured.", 503);
  const response = await (deps.fetch ?? fetch)(SIMILAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    // Documented similar filters: gender, brand, category, price. Stock and
    // currency are checked per offer in toGearProduct instead.
    body: JSON.stringify({ product_id: productId, limit: 10, filters: { price: { max_price: capMinorUnits / 100 } } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error("Channel3 similar failed", response.status, await response.text().catch(() => ""));
    throw new Channel3Error(`Channel3 similar failed (${response.status}).`, response.status);
  }
  const body = searchResponseSchema.parse(await response.json());
  const others = body.products.filter((raw) => (raw as { id?: unknown } | null)?.id !== productId);
  return pickProducts(others, capMinorUnits, { limit: deps.limit ?? 3, context: { productId } });
}

/** Channel3 products → the buyable ones within the cap, one per retailer link, up to `limit`. */
function pickProducts(raws: readonly unknown[], capMinorUnits: number, options: { limit: number; context: Record<string, string> }): GearProduct[] {
  const body = { products: raws };
  const seen = new Set<string>();
  const products: GearProduct[] = [];
  let unparsed = 0;
  for (const raw of body.products) {
    // Told apart from "nothing buyable within the cap": a parse miss means our
    // reading of Channel3's shape is wrong, not that the store has no stock.
    if (!productSchema.safeParse(raw).success) {
      unparsed += 1;
      continue;
    }
    const product = toGearProduct(raw, capMinorUnits);
    if (!product || seen.has(product.url)) continue;
    seen.add(product.url);
    products.push(product);
    if (products.length === options.limit) break;
  }
  if (unparsed > 0) {
    console.warn(`Channel3: ${unparsed} of ${body.products.length} products didn't match the expected shape`, options.context);
  }
  if (body.products.length > 0 && products.length === 0) {
    // Channel3 already filtered to in-stock items under the cap, so every one
    // being dropped here points at availability/price/currency being read wrong.
    console.warn(`Channel3 returned ${body.products.length} products but none passed our filters`, { ...options.context, capMinorUnits });
  }
  return products;
}
