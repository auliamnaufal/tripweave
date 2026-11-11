import { getDestination, origins, type TripPrefs } from "./destinations";

// Travel documents for the demo. Files never leave the browser: we keep only
// metadata (type, holder, last four digits, expiry) in localStorage, never the file itself.

export type DocKind = "passport" | "id" | "visa" | "insurance";

export type TravelDoc = {
  id: string;
  kind: DocKind;
  /** Which traveler this document belongs to (0-based). A trip with N travelers needs its own passport/visa/ID per traveler. */
  travelerIndex: number;
  holder: string;
  last4: string;
  issuer: string;
  expires: string;
  fileName: string;
  fileSize: number;
  addedAt: string;
  source: "chat" | "account";
};

export type DocSettings = {
  useAtCheckout: boolean;
  askBeforeSharing: boolean;
  autoDelete: boolean;
};

export const defaultDocSettings: DocSettings = { useAtCheckout: true, askBeforeSharing: true, autoDelete: false };

export const docMeta: Record<DocKind, { label: string; short: string; hint: string }> = {
  passport: { label: "Passport", short: "Passport", hint: "Photo page, all four corners visible" },
  id: { label: "Government photo ID", short: "Photo ID", hint: "Driver’s licence or national ID card" },
  visa: { label: "Visa or entry permit", short: "Visa", hint: "e-Visa, ESTA, e-VOA or a visa page" },
  insurance: { label: "Travel insurance", short: "Insurance", hint: "Policy certificate with your name on it" },
};

export const docKinds = Object.keys(docMeta) as DocKind[];

export type Need = "required" | "check" | "recommended";
export type Requirement = { kind: DocKind; need: Need; why: string; travelerIndex: number };
export type ReqStatus = "ok" | "missing" | "expiring" | "expired";

const entryNotes: Record<string, string> = {
  oahu: "Visa Waiver travellers need an approved ESTA before flying. Everyone else needs a US visa.",
  kyoto: "Many passports enter Japan visa-free for short stays. Some nationalities need a visa first.",
  lisbon: "Portugal is in the Schengen area. Many visitors are visa-free for 90 days, and an ETIAS authorisation may be needed.",
  amalfi: "Italy is in the Schengen area. Many visitors are visa-free for 90 days, and an ETIAS authorisation may be needed.",
  iceland: "Iceland follows Schengen rules. Many visitors are visa-free for 90 days, and an ETIAS authorisation may be needed.",
  bali: "Most visitors need a Visa on Arrival. The e-VOA can be bought online before you fly.",
  patagonia: "Many passports enter Argentina visa-free for 90 days. Check yours before you book.",
};

const originCountry: Record<string, string> = {
  "San Francisco": "United States",
  "New York": "United States",
  London: "United Kingdom",
  Singapore: "Singapore",
  Jakarta: "Indonesia",
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/heic,image/webp,application/pdf";

export function isDomestic(prefs: TripPrefs): boolean {
  const country = originCountry[prefs.origin] ?? "";
  return (prefs.destId === "oahu" && country === "United States") || (prefs.destId === "bali" && country === "Indonesia");
}

/** One requirement per traveler for document kinds each person must hold individually. */
function perTraveler(prefs: TripPrefs, kind: DocKind, need: Need, why: string): Requirement[] {
  return Array.from({ length: Math.max(1, prefs.travelers) }, (_, travelerIndex) => ({ kind, need, why, travelerIndex }));
}

export function requirementsFor(prefs: TripPrefs): Requirement[] {
  const insurance: Requirement = { kind: "insurance", need: "recommended", why: "Not required to book, but covers delays, cancellations and medical costs abroad.", travelerIndex: 0 };
  if (isDomestic(prefs)) {
    return [...perTraveler(prefs, "id", "required", "Domestic flight. The airline checks a government photo ID at check-in."), insurance];
  }
  return [
    ...perTraveler(prefs, "passport", "required", "Airlines and hotels need it at booking. It should be valid 6 months past your return."),
    ...perTraveler(prefs, "visa", "check", entryNotes[prefs.destId] ?? "Entry rules depend on your passport. Check before you book."),
    insurance,
  ];
}

const DAY = 86_400_000;

/** Demo assumption: trips start about a month out. */
export function tripEnd(prefs: TripPrefs, now = Date.now()): Date {
  return new Date(now + (30 + prefs.nights) * DAY);
}

export function docStatus(doc: TravelDoc, prefs: TripPrefs | null, now = Date.now()): ReqStatus {
  const exp = new Date(doc.expires).getTime();
  if (Number.isNaN(exp)) return "ok";
  if (exp < now) return "expired";
  const end = prefs ? tripEnd(prefs, now).getTime() : now;
  const buffer = doc.kind === "passport" ? 182 * DAY : 0;
  return exp < end + buffer ? "expiring" : "ok";
}

export function findDoc(docs: TravelDoc[], kind: DocKind, travelerIndex = 0): TravelDoc | undefined {
  return docs.find((d) => d.kind === kind && d.travelerIndex === travelerIndex);
}

export type Readiness = { req: Requirement; doc?: TravelDoc; status: ReqStatus };

export function readiness(prefs: TripPrefs, docs: TravelDoc[]): Readiness[] {
  return requirementsFor(prefs).map((req) => {
    const doc = findDoc(docs, req.kind, req.travelerIndex);
    return { req, doc, status: doc ? docStatus(doc, prefs) : "missing" };
  });
}

/** Required items that still block booking. */
export function blockers(prefs: TripPrefs, docs: TravelDoc[]): Readiness[] {
  return readiness(prefs, docs).filter((r) => r.req.need === "required" && r.status !== "ok");
}

export function guessKind(fileName: string, fallback: DocKind): DocKind {
  const n = fileName.toLowerCase();
  if (/passport|paspor/.test(n)) return "passport";
  if (/visa|esta|evoa|e-voa|etias/.test(n)) return "visa";
  if (/insur|asuransi|policy|polis/.test(n)) return "insurance";
  if (/ktp|licen[cs]e|(^|[^a-z])(id|sim)([^a-z]|$)/.test(n)) return "id";
  return fallback;
}

export function validateFile(file: { size: number; type: string }): string | null {
  if (file.size > MAX_FILE_BYTES) return "That file is over 10 MB. Try a smaller photo or PDF.";
  if (file.type && !ACCEPT.split(",").includes(file.type)) return "Use a photo (JPG, PNG, HEIC, WebP) or a PDF.";
  return null;
}

const addYears = (n: number, now: number) => new Date(now + n * 365 * DAY).toISOString().slice(0, 10);

/**
 * Stand-in for document OCR. The real version reads the MRZ / fields server side;
 * the demo fills sample values the traveller can correct in Account → Documents.
 */
export function readDocument(input: { kind: DocKind; fileName: string; fileSize: number; holder: string; prefs: TripPrefs | null; source: TravelDoc["source"]; travelerIndex?: number }, now = Date.now()): TravelDoc {
  const { kind, prefs } = input;
  const travelerIndex = input.travelerIndex ?? 0;
  const issuer = kind === "visa" && prefs ? getDestination(prefs.destId).country.split(", ").pop()! : (originCountry[prefs?.origin ?? origins[0].city] ?? "United States");
  const expires =
    kind === "passport" ? addYears(6 + Math.floor(Math.random() * 3), now) : kind === "id" ? addYears(4, now) : kind === "visa" ? addYears(1, now) : prefs ? new Date(tripEnd(prefs, now).getTime() + 30 * DAY).toISOString().slice(0, 10) : addYears(1, now);
  return {
    id: `${kind}-${travelerIndex}-${now.toString(36)}`,
    kind,
    travelerIndex,
    holder: input.holder,
    last4: String(1000 + Math.floor(Math.random() * 9000)),
    issuer,
    expires,
    fileName: input.fileName,
    fileSize: input.fileSize,
    addedAt: new Date(now).toISOString(),
    source: input.source,
  };
}

export function upsertDoc(docs: TravelDoc[], doc: TravelDoc): TravelDoc[] {
  return [doc, ...docs.filter((d) => !(d.kind === doc.kind && d.travelerIndex === doc.travelerIndex))];
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const statusLabel: Record<ReqStatus, string> = { ok: "Valid", missing: "Needed", expiring: "Expires too soon", expired: "Expired" };

/** Chat intents about documents, checked before trip refinements. */
export type DocIntent = { type: "show" } | { type: "add"; kind?: DocKind } | { type: "remove"; kind?: DocKind } | { type: "privacy" };

export function docIntent(text: string): DocIntent | null {
  const t = text.toLowerCase();
  const kind: DocKind | undefined = /passport|paspor/.test(t) ? "passport" : /visa|esta|e-?voa/.test(t) ? "visa" : /insurance|asuransi/.test(t) ? "insurance" : /\bid\b|ktp|licen[cs]e/.test(t) ? "id" : undefined;
  const aboutDocs = !!kind || /document|dokumen|travel docs/.test(t);
  if (!aboutDocs) return null;
  if (/privacy|private|safe|secure|who (can )?see|aman|share/.test(t)) return { type: "privacy" };
  if (/delete|remove|forget|hapus/.test(t)) return { type: "remove", kind };
  if (/upload|add|attach|new|replace|update|tambah|ganti/.test(t)) return { type: "add", kind };
  return { type: "show" };
}
