"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/Icon";
import { getDestination, type TripPrefs } from "@/features/ui-mock/destinations";
import {
  ACCEPT,
  docKinds,
  docMeta,
  docStatus,
  findDoc,
  fmtDate,
  fmtSize,
  readDocument,
  readiness,
  statusLabel,
  upsertDoc,
  validateFile,
  type DocKind,
  type Need,
  type ReqStatus,
  type TravelDoc,
} from "@/features/ui-mock/documents";
import { docSettingsStore, docsStore, useDocSettings, useDocs, useUser } from "@/features/ui-mock/tripStore";
import "./docs.css";

export const kindIcon: Record<DocKind, IconName> = { passport: "passport", id: "user", visa: "globe", insurance: "shield" };
const needLabel: Record<Need, string> = { required: "Required", check: "Check", recommended: "Optional" };

/** Hidden file input you can open for a specific document type and traveler. */
export function useDocPicker(onFile: (file: File, kind?: DocKind, travelerIndex?: number) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const kindRef = useRef<DocKind | undefined>(undefined);
  const travelerRef = useRef<number | undefined>(undefined);
  const open = (kind?: DocKind, travelerIndex?: number) => {
    kindRef.current = kind;
    travelerRef.current = travelerIndex;
    ref.current?.click();
  };
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f, kindRef.current, travelerRef.current);
      }}
    />
  );
  return { open, input };
}

function StatusPill({ status }: { status: ReqStatus }) {
  return (
    <span className={`td-pill is-${status}`}>
      {status === "ok" ? <Icon name="check" size={12} /> : <i aria-hidden="true" />}
      {status === "ok" ? "On file" : statusLabel[status]}
    </span>
  );
}

/**
 * The checklist the planner drops into the chat, and the trip readiness card in Account.
 * Reads the document store live, so uploads anywhere update every copy.
 */
export function DocChecklist({
  prefs,
  busy,
  onPick,
  variant = "chat",
}: {
  prefs: TripPrefs | null;
  busy?: boolean;
  onPick: (kind: DocKind, travelerIndex: number) => void;
  variant?: "chat" | "panel";
}) {
  const docs = useDocs();
  const rows = prefs
    ? readiness(prefs, docs)
    : docKinds.map((kind) => {
        const doc = findDoc(docs, kind);
        return { req: { kind, need: "recommended" as Need, why: docMeta[kind].hint, travelerIndex: 0 }, doc, status: doc ? docStatus(doc, null) : ("missing" as ReqStatus) };
      });
  const required = rows.filter((r) => r.req.need === "required");
  const ready = required.filter((r) => r.status === "ok").length;
  const dest = prefs ? getDestination(prefs.destId) : null;
  // More than one row of the same kind means one per traveler, so the label needs to say which.
  const countByKind = rows.reduce<Partial<Record<DocKind, number>>>((m, r) => ({ ...m, [r.req.kind]: (m[r.req.kind] ?? 0) + 1 }), {});

  return (
    <div className={`td-check td-check-${variant}`}>
      <div className="td-check-head">
        <span>
          <b>{dest ? `Documents for ${dest.name}` : "Your travel documents"}</b>
          <small>{prefs ? (required.length ? `${ready} of ${required.length} required ready` : "Nothing required") : `${docs.length} on file`}</small>
        </span>
        {prefs && required.length > 0 && (
          <span className="td-ring" style={{ "--p": `${(ready / required.length) * 100}%` } as React.CSSProperties} aria-hidden="true">
            {ready === required.length && <Icon name="check" size={12} />}
          </span>
        )}
      </div>
      <ul className="td-rows">
        {rows.map(({ req, doc, status }) => (
          <li key={`${req.kind}-${req.travelerIndex}`} className={`td-row is-${status}`}>
            <span className="td-icon">
              <Icon name={kindIcon[req.kind]} size={17} />
            </span>
            <span className="td-text">
              <b>
                {docMeta[req.kind].label}
                {(countByKind[req.kind] ?? 0) > 1 && ` · Traveler ${req.travelerIndex + 1}`}
                {prefs && <em className={`td-need need-${req.need}`}>{needLabel[req.need]}</em>}
              </b>
              <small>{doc ? `•••• ${doc.last4} · valid until ${fmtDate(doc.expires)}` : req.why}</small>
            </span>
            {doc && status === "ok" ? (
              <StatusPill status="ok" />
            ) : (
              <button type="button" className={`td-upload ${doc ? "is-replace" : ""}`} onClick={() => onPick(req.kind, req.travelerIndex)} disabled={busy}>
                <Icon name="upload" size={14} />
                {doc ? "Replace" : "Upload"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="td-foot">
        <Icon name="lock" size={13} />
        <span>
          Kept private on this device. Shared only with the airline or hotel that needs it, after you approve payment.{" "}
          {variant === "chat" && <Link href="/account?tab=documents">Manage</Link>}
        </span>
      </p>
    </div>
  );
}

/** Account → Documents. */
export function DocumentsPanel({ prefs }: { prefs: TripPrefs }) {
  const docs = useDocs();
  const settings = useDocSettings();
  const user = useUser();
  const [addKind, setAddKind] = useState<DocKind>("passport");
  const [addTraveler, setAddTraveler] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [dragging, setDragging] = useState(false);

  function save(file: File, kind?: DocKind, travelerIndex?: number) {
    const problem = validateFile(file);
    if (problem) return setError(problem);
    setError(null);
    const idx = travelerIndex ?? addTraveler;
    const holder = idx === 0 ? user?.name ?? "Traveller" : `Traveller ${idx + 1}`;
    const doc = readDocument({ kind: kind ?? addKind, fileName: file.name, fileSize: file.size, holder, prefs, source: "account", travelerIndex: idx });
    docsStore.set(upsertDoc(docsStore.get(), doc));
    setJustAdded(doc.id);
  }
  const picker = useDocPicker(save);

  return (
    <div className="td-panel">
      {picker.input}
      <div className="td-intro">
        <h2 className="ac-h2">Travel documents</h2>
        <p>Upload once. The planner fills them in when you book, and you can also manage them by chat, for example “update my passport”.</p>
      </div>

      <div className="ac-callout td-privacy">
        <span className="ac-callout-icon">
          <Icon name="lock" size={20} />
        </span>
        <div>
          <b>Private by default</b>
          <ul>
            <li>Only what a booking needs is shared, and only with that airline or hotel.</li>
            <li>Never used to train AI models, never sold, never shown to other travellers.</li>
            <li>Delete any document, or all of them, whenever you like.</li>
          </ul>
        </div>
      </div>

      <section>
        <h2 className="ac-h2">Ready for your next trip?</h2>
        <DocChecklist prefs={prefs} onPick={(k, idx) => picker.open(k, idx)} variant="panel" />
      </section>

      <section>
        <h2 className="ac-h2">On file</h2>
        <div className="td-grid">
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} prefs={prefs} fresh={justAdded === d.id} onReplace={() => picker.open(d.kind, d.travelerIndex)} />
          ))}
          <div
            className={`td-add ${dragging ? "is-drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) save(f);
            }}
          >
            <span className="td-add-icon">
              <Icon name="plus" size={18} />
            </span>
            <b>Add a document</b>
            <div className="td-kinds" role="radiogroup" aria-label="Document type">
              {docKinds.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={addKind === k} className={addKind === k ? "is-on" : ""} onClick={() => setAddKind(k)}>
                  {docMeta[k].short}
                </button>
              ))}
            </div>
            {prefs.travelers > 1 && (
              <div className="td-kinds" role="radiogroup" aria-label="Traveler">
                {Array.from({ length: prefs.travelers }, (_, i) => (
                  <button key={i} type="button" role="radio" aria-checked={addTraveler === i} className={addTraveler === i ? "is-on" : ""} onClick={() => setAddTraveler(i)}>
                    Traveler {i + 1}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-sm" onClick={() => picker.open(addKind, addTraveler)}>
              <Icon name="upload" size={14} /> Choose file
            </button>
            <small>or drop it here · JPG, PNG, HEIC or PDF up to 10 MB</small>
            {error && (
              <p className="td-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="ac-field">
        <h2 className="ac-h2">How documents are used</h2>
        {(
          [
            ["useAtCheckout", "Fill in at checkout", "The planner adds your saved details to each booking, so you don’t type them again"],
            ["askBeforeSharing", "Ask before each share", "Show exactly which supplier gets which document before anything is sent"],
            ["autoDelete", "Delete after my trip", "Remove all documents 30 days after your last trip ends"],
          ] as const
        ).map(([key, title, sub]) => (
          <label key={key} className="ac-toggle">
            <span>
              <b>{title}</b>
              <small>{sub}</small>
            </span>
            <input type="checkbox" checked={settings[key]} onChange={() => docSettingsStore.set({ ...settings, [key]: !settings[key] })} />
            <i aria-hidden="true" />
          </label>
        ))}
      </section>

      {docs.length > 0 && (
        <div className="td-danger">
          {confirmAll ? (
            <>
              <span>Delete all {docs.length} documents from this device? This can’t be undone.</span>
              <button
                type="button"
                className="btn btn-sm td-btn-danger"
                onClick={() => {
                  docsStore.clear();
                  setConfirmAll(false);
                }}
              >
                Delete all
              </button>
              <button type="button" className="ac-link" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="ac-link" onClick={() => setConfirmAll(true)}>
              Delete all documents
            </button>
          )}
        </div>
      )}
      <p className="td-legal">
        Entry rules change and depend on your nationality. Tripweave’s checklist is guidance, not legal advice. Confirm visa and passport rules with the
        destination’s official government source before you travel. <Link href="/legal#documents">How we handle documents</Link>
      </p>
    </div>
  );
}

function DocCard({ doc, prefs, fresh, onReplace }: { doc: TravelDoc; prefs: TripPrefs; fresh: boolean; onReplace: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ holder: doc.holder, last4: doc.last4, expires: doc.expires });
  const status = docStatus(doc, prefs);

  function commit(e: React.FormEvent) {
    e.preventDefault();
    docsStore.set(docsStore.get().map((d) => (d.id === doc.id ? { ...d, holder: draft.holder.trim() || d.holder, last4: draft.last4.replace(/\D/g, "").slice(-4) || d.last4, expires: draft.expires || d.expires } : d)));
    setEditing(false);
  }

  return (
    <article className={`td-card ${fresh ? "is-fresh" : ""}`}>
      <header>
        <span className="td-icon">
          <Icon name={kindIcon[doc.kind]} size={17} />
        </span>
        <span className="td-card-kind">{docMeta[doc.kind].label}</span>
        <StatusPill status={status} />
      </header>
      {editing ? (
        <form className="td-edit" onSubmit={commit}>
          <label className="ac-input">
            <span>Name as on document</span>
            <input value={draft.holder} onChange={(e) => setDraft({ ...draft, holder: e.target.value })} autoComplete="off" />
          </label>
          <div className="td-edit-row">
            <label className="ac-input">
              <span>Last 4 digits</span>
              <input value={draft.last4} inputMode="numeric" maxLength={4} onChange={(e) => setDraft({ ...draft, last4: e.target.value })} autoComplete="off" />
            </label>
            <label className="ac-input">
              <span>Expires</span>
              <input type="date" value={draft.expires} onChange={(e) => setDraft({ ...draft, expires: e.target.value })} />
            </label>
          </div>
          <div className="td-card-actions">
            <button type="submit" className="btn btn-sm">
              Save
            </button>
            <button type="button" className="ac-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="td-holder">{doc.holder}</p>
          <dl className="td-meta">
            <div>
              <dt>Number</dt>
              <dd className="ac-mono">•••• {doc.last4}</dd>
            </div>
            <div>
              <dt>{doc.kind === "visa" ? "For" : "Issued by"}</dt>
              <dd>{doc.issuer}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{fmtDate(doc.expires)}</dd>
            </div>
          </dl>
          <p className="td-file">
            <Icon name="file" size={13} />
            <span>
              {doc.fileName} · {fmtSize(doc.fileSize)} · added {fmtDate(doc.addedAt)} {doc.source === "chat" ? "in chat" : ""}
            </span>
          </p>
          <div className="td-card-actions">
            <button type="button" className="td-act" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> Edit
            </button>
            <button type="button" className="td-act" onClick={onReplace}>
              <Icon name="upload" size={14} /> Replace
            </button>
            <button type="button" className="td-act td-act-danger" onClick={() => docsStore.set(docsStore.get().filter((d) => d.id !== doc.id))}>
              <Icon name="trash" size={14} /> Remove
            </button>
          </div>
        </>
      )}
    </article>
  );
}

/** Compact list for checkout: what gets shared, with whom. */
export function DocShareSummary({ prefs, suppliers }: { prefs: TripPrefs; suppliers: string[] }) {
  const docs = useDocs();
  const settings = useDocSettings();
  const rows = readiness(prefs, docs).filter((r) => r.req.need !== "recommended" || r.doc);
  const countByKind = rows.reduce<Partial<Record<DocKind, number>>>((m, r) => ({ ...m, [r.req.kind]: (m[r.req.kind] ?? 0) + 1 }), {});
  return (
    <div className="td-share">
      <ul className="td-rows">
        {rows.map(({ req, doc, status }) => (
          <li key={`${req.kind}-${req.travelerIndex}`} className={`td-row is-${status}`}>
            <span className="td-icon">
              <Icon name={kindIcon[req.kind]} size={16} />
            </span>
            <span className="td-text">
              <b>
                {docMeta[req.kind].label}
                {(countByKind[req.kind] ?? 0) > 1 && ` · Traveler ${req.travelerIndex + 1}`}
              </b>
              <small>{doc ? `•••• ${doc.last4} · shared with ${suppliers.join(", ")}` : req.need === "required" ? "Missing. Add it before paying." : req.why}</small>
            </span>
            {doc ? <StatusPill status={status} /> : <Link href="/account?tab=documents" className="td-upload">Add</Link>}
          </li>
        ))}
      </ul>
      <p className="td-foot">
        <Icon name="lock" size={13} />
        <span>
          {settings.askBeforeSharing ? "You’ll confirm each share before it’s sent." : "Shared automatically once you approve payment."}{" "}
          <Link href="/account?tab=documents">Document settings</Link>
        </span>
      </p>
    </div>
  );
}
