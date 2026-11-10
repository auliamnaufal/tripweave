export const runtime = "nodejs";

type Suggestion = { type?: string; name?: string; iata_code?: string; city_name?: string; iata_country_code?: string };

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * Airport and city search for "where are you flying from", backed by Duffel's
 * place suggestions, so any airport in the world can be picked, not a fixed list.
 * Answers `[{ label: "Tokyo, Japan (HND)", city, country, iata }]`.
 */
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (query.length < 2) return Response.json({ places: [] });
  const key = process.env.DUFFEL_API_KEY;
  if (!key) return Response.json({ places: [] });

  try {
    const response = await fetch(`https://api.duffel.com/places/suggestions?${new URLSearchParams({ query })}`, {
      headers: { Authorization: `Bearer ${key}`, "Duffel-Version": "v2", Accept: "application/json" },
    });
    if (!response.ok) return Response.json({ places: [] });
    const body = (await response.json()) as { data?: Suggestion[] };
    const seen = new Set<string>();
    const places = (body.data ?? [])
      .filter((item) => item.iata_code && item.iata_country_code)
      .map((item) => {
        const city = item.type === "city" ? item.name ?? "" : item.city_name ?? item.name ?? "";
        const country = regionNames.of(item.iata_country_code!) ?? item.iata_country_code!;
        const airport = item.type === "airport" && item.name && item.name !== city ? ` · ${item.name}` : "";
        return { label: `${city}, ${country} (${item.iata_code})${airport}`, city, country, iata: item.iata_code! };
      })
      .filter((place) => place.city && !seen.has(place.iata) && seen.add(place.iata))
      .slice(0, 8);
    return Response.json({ places });
  } catch {
    return Response.json({ places: [] });
  }
}
