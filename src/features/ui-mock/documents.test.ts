import { describe, expect, it } from "vitest";
import { defaultPrefs } from "./destinations";
import { blockers, docIntent, docStatus, guessKind, readDocument, requirementsFor, upsertDoc, validateFile } from "./documents";

const NOW = Date.UTC(2026, 10, 10);

describe("travel documents", () => {
  it("asks for a passport abroad and only a photo ID for domestic trips", () => {
    expect(requirementsFor({ ...defaultPrefs("kyoto"), origin: "San Francisco" }).map((r) => r.kind)).toEqual(["passport", "visa", "insurance"]);
    expect(requirementsFor({ ...defaultPrefs("oahu"), origin: "New York" })[0].kind).toBe("id");
    expect(requirementsFor({ ...defaultPrefs("bali"), origin: "Jakarta" })[0].kind).toBe("id");
    expect(requirementsFor({ ...defaultPrefs("oahu"), origin: "London" })[0].kind).toBe("passport");
  });

  it("flags a passport that expires within six months of the trip", () => {
    const prefs = defaultPrefs("kyoto");
    const doc = readDocument({ kind: "passport", fileName: "p.jpg", fileSize: 1000, holder: "A", prefs, source: "chat" }, NOW);
    expect(docStatus(doc, prefs, NOW)).toBe("ok");
    expect(docStatus({ ...doc, expires: "2027-02-01" }, prefs, NOW)).toBe("expiring");
    expect(docStatus({ ...doc, expires: "2025-01-01" }, prefs, NOW)).toBe("expired");
  });

  it("clears the blocker once the passport is on file, keeping one doc per kind", () => {
    const prefs = defaultPrefs("lisbon");
    expect(blockers(prefs, []).map((b) => b.req.kind)).toEqual(["passport"]);
    const a = readDocument({ kind: "passport", fileName: "a.jpg", fileSize: 1, holder: "A", prefs, source: "chat" }, NOW);
    const b = readDocument({ kind: "passport", fileName: "b.jpg", fileSize: 1, holder: "A", prefs, source: "chat" }, NOW + 1);
    const docs = upsertDoc(upsertDoc([], a), b);
    expect(docs).toHaveLength(1);
    expect(blockers(prefs, docs)).toEqual([]);
  });

  it("guesses the type from the file name and rejects bad files", () => {
    expect(guessKind("Paspor_Mara.pdf", "id")).toBe("passport");
    expect(guessKind("bali-evoa.png", "passport")).toBe("visa");
    expect(guessKind("ktp.jpg", "passport")).toBe("id");
    expect(guessKind("IMG_2041.jpg", "passport")).toBe("passport");
    expect(validateFile({ size: 11 * 1024 * 1024, type: "image/jpeg" })).toMatch(/10 MB/);
    expect(validateFile({ size: 100, type: "text/plain" })).toMatch(/PDF/);
    expect(validateFile({ size: 100, type: "application/pdf" })).toBeNull();
  });

  it("reads document requests from chat", () => {
    expect(docIntent("remove my passport")).toEqual({ type: "remove", kind: "passport" });
    expect(docIntent("upload my visa")).toEqual({ type: "add", kind: "visa" });
    expect(docIntent("show my documents")).toEqual({ type: "show" });
    expect(docIntent("How are my documents kept private?")).toEqual({ type: "privacy" });
    expect(docIntent("Make the hotel cheaper")).toBeNull();
    expect(docIntent("Where should we eat in Kyoto?")).toBeNull();
  });
});
