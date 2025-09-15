import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// ---------- Libraries ----------
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
import interact from "interactjs";
import saveAs from "file-saver";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// ---------- Utils ----------
async function blobToArrayBuffer(blob) { return await blob.arrayBuffer(); }

function toUint8(bytesLike) {
  if (bytesLike instanceof Uint8Array) return bytesLike.slice();
  if (bytesLike instanceof ArrayBuffer) return new Uint8Array(bytesLike).slice();
  if (ArrayBuffer.isView(bytesLike)) return new Uint8Array(bytesLike.buffer, bytesLike.byteOffset, bytesLike.byteLength).slice();
  throw new TypeError("Unsupported bytes input");
}

function downloadBlob(blob, filename) {
  try { if (typeof saveAs === "function") return saveAs(blob, filename); } catch (_) {}
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(a.href); a.remove();
}

function viewportToPdfRectFromViewportRect(vx, vy, vwidth, vheight, viewport) {
  const [px1, py1] = viewport.convertToPdfPoint(vx, vy);
  const [px2, py2] = viewport.convertToPdfPoint(vx + vwidth, vy + vheight);
  return { x: Math.min(px1, px2), y: Math.min(py1, py2), width: Math.abs(px2 - px1), height: Math.abs(py2 - py1) };
}

function pdfRectToViewportRect(pdfRectArray, viewport) {
  const rect = viewport.convertToViewportRectangle(pdfRectArray);
  return { x: Math.min(rect[0], rect[2]), y: Math.min(rect[1], rect[3]), width: Math.abs(rect[2] - rect[0]), height: Math.abs(rect[3] - rect[1]) };
}

const pageWrapperStyle = { border: "1px solid #e5e7eb", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", margin: "16px auto", borderRadius: 8, overflow: "hidden", position: "relative", display: "inline-block", lineHeight: 0, background: "#fff" };
const pageCanvasStyle = { display: "block", width: "100%", height: "auto" };

// ---------- UI ----------
function TypeIcon({ type, size = 14, color = "#1f2937" }) {
  const s = { width: size, height: size, display: "inline-block" };
  switch (type) {
    case "text":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <path fill={color} d="M5 5h14v2H13v12h-2V7H5z"/>
        </svg>
      );
    case "checkbox":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke={color} strokeWidth="2"/>
          <path d="M7 12l3 3 7-7" fill="none" stroke={color} strokeWidth="2"/>
        </svg>
      );
    case "radio":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" fill={color}/>
        </svg>
      );
    case "dropdown":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke={color} strokeWidth="2"/>
          <path d="M8 12l4 4 4-4" fill="none" stroke={color} strokeWidth="2"/>
        </svg>
      );
    case "date":
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke={color} strokeWidth="2"/>
          <path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke={color} strokeWidth="2"/>
        </svg>
      );
    default:
      return null;
  }
}
function Toolbar({ onApply, onAddField, onRunTests, disableApply }) {
  return (
    <div className="toolbar">
      <button onClick={() => onAddField("text")} className="btn">Text</button>
      <button onClick={() => onAddField("checkbox")} className="btn">Checkbox</button>
      <button onClick={() => onAddField("radio")} className="btn">Radio</button>
      <button onClick={() => onAddField("dropdown")} className="btn">Dropdown</button>
      <button onClick={() => onAddField("date")} className="btn">Date</button>
      <button onClick={onApply} disabled={disableApply} className="btn primary">Apply & Download</button>
      <style>{`
        .toolbar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px }
        .btn { padding:8px 14px; border:1px solid #d1d5db; border-radius:6px; background:#f9fafb; font-size:14px; transition:all .2s; }
        .btn:hover:not(:disabled){ background:#f3f4f6; border-color:#9ca3af }
        .btn.primary{ background:#2563eb; color:#fff; border-color:#2563eb }
        .btn.primary:hover:not(:disabled){ background:#1d4ed8 }
        .btn:disabled{ opacity:.5; cursor:not-allowed }
      `}</style>
    </div>
  );
}

function LeftSidebar({ pages, overlays, selectedId, onSelect }) {
  const byPage = Array.from({ length: pages.length || 0 }, (_, i) => ({
    pageIndex: i,
    items: overlays.filter((f) => f.pageIndex === i),
  }));
  return (
    <aside className="sidebar left">
      <div className="side-header">Fields</div>
      <div className="side-content">
        {byPage.map(({ pageIndex, items }) => (
          <div className="page-group" key={pageIndex}>
            <div className="page-title">Page {pageIndex + 1} <span className="count">{items.length}</span></div>
            <div className="page-list">
              {items.map((f) => (
                <button
                  key={f.id}
                  className={`field-item${selectedId === f.id ? " selected" : ""}`}
                  onClick={() => onSelect(f.id)}
                  title={f.name || f.id}
                >
                  <span className="label">{f.name || "Untitled"}</span>
                  <span className="icon"><TypeIcon type={f.type} size={14} color="#2563eb" /></span>
                </button>
              ))}
              {items.length === 0 && (
                <div className="empty">No fields</div>
              )}
            </div>
          </div>
        ))}
        {(!pages || pages.length === 0) && (
          <div className="empty">Upload a PDF to see fields</div>
        )}
      </div>
      <style>{`
        .sidebar.left { border-right:1px solid #e5e7eb; background:#fafafa; display:flex; flex-direction:column; height:100vh }
        .side-header { padding:10px 12px; font-weight:600; color:#111827; border-bottom:1px solid #e5e7eb }
        .side-content { padding:8px; overflow:auto; flex:1; min-height:0 }
        .page-group { margin-bottom:10px }
        .page-title { font-size:12px; font-weight:600; color:#374151; display:flex; align-items:center; gap:6px }
        .page-title .count { background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; border-radius:999px; padding:0 6px; font-size:10px }
        .page-list { margin-top:6px; display:flex; flex-direction:column; gap:6px }
        .field-item { display:flex; align-items:center; gap:8px; padding:8px; border:1px solid #e5e7eb; border-radius:8px; background:white; cursor:pointer; text-align:left; width:220px }
        .field-item:hover { border-color:#cbd5e1; background:#f9fafb }
        .field-item.selected { border-color:#3b82f6; background:#eff6ff }
        .field-item .label { flex:1; font-size:12px; color:#111827; text-align:left }
        .field-item .icon { width:18px; display:inline-flex; align-items:center; justify-content:flex-end; margin-left:auto }
        .empty { color:#9ca3af; font-size:12px; padding:8px }
      `}</style>
    </aside>
  );
}

function RightSidebar({ field, pagesCount, onChange, onDelete }) {
  const dataType = !field ? "" : (field.type === "checkbox" || field.type === "radio" ? "boolean" : field.type === "date" ? "date" : "string");
  const [nameExpanded, setNameExpanded] = useState(false);
  function update(k, v) { onChange({ ...field, [k]: v }); }
  function updateNum(k, v) { const n = Number(v); if (!Number.isFinite(n)) return; onChange({ ...field, [k]: n }); }
  return (
    <aside className="sidebar right">
      <div className="side-header">Properties</div>
      <div className="side-content">
        {!field && <div className="empty">Select a field to edit</div>}
        {field && (
          <div className="prop-grid">
            <div className="row">
              <div className="label">Type</div>
              <div className="value type"><TypeIcon type={field.type} size={14} color="#2563eb" /> <span>{field.type}</span></div>
            </div>
            <div className="row column">
              <div className="label with-toggle">
                <button
                  className={`disclosure${nameExpanded?" open":""}`}
                  aria-label="Toggle name hierarchy"
                  onClick={()=> setNameExpanded(v=>!v)}
                />
                <span>Name hierarchy</span>
              </div>
              {!nameExpanded ? (
                <div className="hierarchy summary">
                  <div className="chip summary-chip" title={field.name || ""}>
                    {(field.name || "").split(".").filter(Boolean).join(" › ") || "—"}
                  </div>
                  <button className="add-chip" onClick={()=> setNameExpanded(true)}>Edit</button>
                </div>
              ) : (
                <div className="hierarchy pretty">
                  {(field.name || "").split(".").filter(Boolean).map((seg, i) => (
                    <div className="chip" key={i}>
                      <input
                        className="chip-input"
                        value={seg}
                        onChange={(e)=>{
                          const parts = (field.name || "").split(".").filter(Boolean);
                          parts[i] = e.target.value;
                          update("name", parts.map(s=>s.trim()).filter(Boolean).join("."));
                        }}
                        placeholder={`Level ${i+1}`}
                      />
                      <button
                        className="chip-remove"
                        title="Remove level"
                        onClick={()=>{
                          const parts = (field.name || "").split(".").filter(Boolean);
                          parts.splice(i,1);
                          update("name", parts.map(s=>s.trim()).filter(Boolean).join("."));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="add-chip"
                    onClick={()=>{
                      const parts = (field.name || "").split(".").filter(Boolean);
                      parts.push("New");
                      update("name", parts.map(s=>s.trim()).filter(Boolean).join("."));
                    }}
                  >
                    + Add level
                  </button>
                </div>
              )}
            </div>
            <div className="row">
              <div className="label">Data type</div>
              <div className="value">{dataType}</div>
            </div>
            {field.type === "checkbox" || field.type === "radio" ? (
              <div className="row">
                <label className="label" htmlFor="p-checked">Checked</label>
                <input id="p-checked" type="checkbox" checked={!!field.value} onChange={(e)=>update("value", e.target.checked)} />
              </div>
            ) : (
              <div className="row">
                <label className="label" htmlFor="p-value">Value</label>
                <input id="p-value" className="input" value={field.value ?? ""} onChange={(e)=>update("value", e.target.value)} placeholder="Field value" />
              </div>
            )}
            {field.type === "dropdown" && (
              <div className="row">
                <label className="label" htmlFor="p-options">Options</label>
                <input id="p-options" className="input" placeholder="Comma-separated"
                  value={Array.isArray(field.options) ? field.options.join(", ") : ""}
                  onChange={(e)=> update("options", e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} />
              </div>
            )}
            <div className="row">
              <label className="label" htmlFor="p-page">Page</label>
              <select id="p-page" className="input" value={field.pageIndex} onChange={(e)=> update("pageIndex", Number(e.target.value))}>
                {Array.from({length: pagesCount || 0}, (_,i)=>(<option key={i} value={i}>Page {i+1}</option>))}
              </select>
            </div>
            <div className="row two">
              <div className="sub">
                <label className="label" htmlFor="p-x">X</label>
                <input id="p-x" className="input" type="number" value={Math.round(field.x)} onChange={(e)=>updateNum("x", e.target.value)} />
              </div>
              <div className="sub">
                <label className="label" htmlFor="p-y">Y</label>
                <input id="p-y" className="input" type="number" value={Math.round(field.y)} onChange={(e)=>updateNum("y", e.target.value)} />
              </div>
            </div>
            <div className="row two">
              <div className="sub">
                <label className="label" htmlFor="p-w">Width</label>
                <input id="p-w" className="input" type="number" value={Math.round(field.width)} onChange={(e)=>updateNum("width", e.target.value)} disabled={field.type==='checkbox'||field.type==='radio'} />
              </div>
              <div className="sub">
                <label className="label" htmlFor="p-h">Height</label>
                <input id="p-h" className="input" type="number" value={Math.round(field.height)} onChange={(e)=>updateNum("height", e.target.value)} disabled={field.type==='checkbox'||field.type==='radio'} />
              </div>
            </div>
            <div className="row">
              <button className="danger" onClick={()=> onDelete(field.id)}>Delete Field</button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        .sidebar.right { border-left:1px solid #e5e7eb; background:#ffffff; display:flex; flex-direction:column; height:100vh }
        .side-header { padding:10px 12px; font-weight:600; color:#111827; border-bottom:1px solid #e5e7eb }
        .side-content { padding:12px; overflow:auto; flex:1; min-height:0 }
        .empty { color:#9ca3af; font-size:12px }
        .prop-grid { display:flex; flex-direction:column; gap:10px }
        .row { display:flex; align-items:center; gap:10px }
        .row.column { align-items:flex-start; flex-direction:column }
        .row.two { display:grid; grid-template-columns:1fr 1fr; gap:10px }
        .row .sub { display:flex; flex-direction:column; gap:6px }
        .label { width:110px; font-size:12px; color:#4b5563 }
        .label.with-toggle { display:flex; align-items:center; gap:6px }
        .disclosure { width:12px; height:12px; border:none; background:transparent; cursor:pointer; position:relative }
        .disclosure::before { content:""; position:absolute; left:2px; top:1px; width:0; height:0; border-left:6px solid #6b7280; border-top:5px solid transparent; border-bottom:5px solid transparent; transition:transform .15s ease }
        .disclosure.open::before { transform:rotate(90deg); transform-origin:3px 6px }
        .value { font-size:12px; color:#111827 }
        .value.type { display:flex; align-items:center; gap:6px }
        .input { flex:1; padding:8px 10px; border:1px solid #e5e7eb; border-radius:6px; font-size:12px; background:#f9fafb }
        .hierarchy.summary { width:100%; display:flex; align-items:center; gap:8px }
        .hierarchy.summary .summary-chip { padding:6px 10px; border:1px solid #e5e7eb; background:#f9fafb; border-radius:6px; font-size:12px; color:#111827; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
        .hierarchy.pretty { width:100%; display:flex; align-items:center; flex-wrap:wrap; gap:6px }
        .hierarchy.pretty .chip { display:inline-flex; align-items:center; gap:6px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:14px; padding:4px 8px }
        .hierarchy.pretty .chip-input { border:none; background:transparent; font-size:12px; min-width:40px; outline:none }
        .hierarchy.pretty .chip-remove { width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; background:#fff; border-radius:999px; cursor:pointer; font-size:12px; line-height:1; color:#ef4444 }
        .hierarchy.pretty .chip-remove:hover { background:#fef2f2; border-color:#fecaca }
        .hierarchy.pretty .add-chip { border:1px dashed #cbd5e1; background:#f1f5f9; color:#0f172a; border-radius:10px; padding:6px 8px; font-size:12px; cursor:pointer }
        .hierarchy.pretty .add-chip:hover { background:#e5e7eb }
        .danger { background:#ef4444; color:#fff; border:none; border-radius:6px; padding:8px 10px; cursor:pointer }
        .danger:hover { background:#dc2626 }
      `}</style>
    </aside>
  );
}

function OverlayField({ field, onChange, onDelete, selected, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;

    interact(el)
      .draggable({
        listeners: {
          start() { el.dataset.dx = "0"; el.dataset.dy = "0"; },
          move(event) {
            const dx = (parseFloat(el.dataset.dx || "0") + event.dx);
            const dy = (parseFloat(el.dataset.dy || "0") + event.dy);
            el.dataset.dx = String(dx); el.dataset.dy = String(dy);
            el.style.transform = `translate(${dx}px, ${dy}px)`;
          },
          end() {
            const dx = parseFloat(el.dataset.dx || "0");
            const dy = parseFloat(el.dataset.dy || "0");
            onChange({ ...field, x: field.x + dx, y: field.y + dy, width: field.width, height: field.height });
            el.style.transform = ""; el.dataset.dx = "0"; el.dataset.dy = "0";
          },
        },
      });

    // Keep checkbox/radio size fixed; only allow resizing for others
    if (!(field.type === "checkbox" || field.type === "radio")) {
      interact(el).resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
          move(event) {
            let rx = parseFloat(event.target.dataset.rx || "0");
            let ry = parseFloat(event.target.dataset.ry || "0");
            rx += event.deltaRect.left; ry += event.deltaRect.top;
            Object.assign(event.target.style, { width: `${event.rect.width}px`, height: `${event.rect.height}px`, transform: `translate(${rx}px, ${ry}px)` });
            Object.assign(event.target.dataset, { rx, ry });
          },
          end(event) {
            const rx = parseFloat(event.target.dataset.rx || "0");
            const ry = parseFloat(event.target.dataset.ry || "0");
            onChange({ ...field, x: field.x + rx, y: field.y + ry, width: event.rect.width, height: event.rect.height });
            event.target.style.transform = ""; event.target.dataset.rx = "0"; event.target.dataset.ry = "0";
          },
        },
      });
    }

    return () => interact(el).unset();
  }, [field, onChange]);

  const body = (() => {
    switch (field.type) {
      case "text":
      case "date":
      case "dropdown":
        return (
          <div className="field-visual inputlike">
            <input
              type={field.type === "date" ? "date" : "text"}
              value={field.value ?? ""}
              onChange={(e) => onChange({ ...field, value: e.target.value })}
              className="field-input"
              placeholder={field.type === "text" ? "Text" : field.type === "date" ? "Date" : "Select"}
            />
            <span className="suffix">
              <TypeIcon type={field.type} size={12} color="#2563eb" />
            </span>
          </div>
        );
      case "checkbox":
        return (<div className="field-visual tick readonly"><span className={`box${field.value?" on":""}`} aria-hidden /></div>);
      case "radio":
        return (<div className="field-visual radio readonly"><span className={`dot${field.value?" on":""}`} aria-hidden /></div>);
      default:
        return null;
    }
  })();

  const compact = Math.min(field.width, field.height) < 28;
  return (
    <div
      ref={ref}
      className={`overlay-field${selected ? " selected" : ""}${compact?" compact":""}`}
      style={{ position: "absolute", left: field.x, top: field.y, width: field.width, height: field.height, cursor: "move" }}
      onMouseDown={(e)=>{ e.stopPropagation(); onSelect?.(field.id); }}
      title={`${field.type}${field.name ? ` • ${field.name}` : ""}`}
    >
      {!compact && (
        <div className="field-header">
          <span className="name">{field.name || "Untitled"}</span>
        </div>
      )}
      {body}
      {/* Delete button removed from overlay; use sidebar or keyboard */}
      
      <style>{`
        .overlay-field { background: rgba(59,130,246,0.08); border: 1px solid #93c5fd; border-radius: 0px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 2px 6px rgba(15,23,42,.12) }
        .overlay-field.compact { justify-content:center; align-items:center }
        .overlay-field.selected { border-color:#3b82f6; box-shadow:0 4px 10px rgba(37,99,235,.25) }
        .field-header { display:flex; align-items:center; gap:6px; padding:2px 6px; background:rgba(255,255,255,.9); border-bottom:1px solid rgba(59,130,246,.25) }
        .field-header .name { font-size:10px; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
        .field-visual { flex:1; display:flex; align-items:center; justify-content:center; position:relative }
        .field-visual.inputlike { padding:2px 4px; gap:6px }
        .field-visual .suffix { display:inline-flex; align-items:center; justify-content:center; padding:2px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px }
        .field-input { width:100%; height:100%; border:none; outline:none; background:transparent; padding:2px 4px; font-size:12px; color:#111827 }
        .field-visual.readonly { pointer-events:none }
        .field-visual.tick .box { width:70%; height:70%; border:2px solid #2563eb; border-radius:0px; background:rgba(255,255,255,0.9) }
        .field-visual.tick .box.on { background:#2563eb; box-shadow:inset 0 0 0 2px white }
        .field-visual.radio .dot { width:70%; height:70%; border:2px solid #2563eb; border-radius:999px; background:transparent }
        .field-visual.radio .dot.on { background:#2563eb; box-shadow:inset 0 0 0 4px white }
        .field-label { position:absolute; left:2px; bottom:2px; font-size:10px; color:#111827; background:rgba(255,255,255,.8); padding:0 3px; border-radius:3px }
      `}</style>
    </div>
  );
}

function PageLayer({ page, pageIndex, overlays, onOverlayChange, onDeleteOverlay, onSelect, selectedId }) {
  const canvasRef = useRef(null);
  const pageRef = useRef(null);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vp = page.getViewport({ scale: 1.5, rotation: page.rotate });
      const canvas = canvasRef.current; const ctx = canvas.getContext("2d");
      canvas.height = vp.height; canvas.width = vp.width;
      const renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
      if (!cancelled) { setViewport(vp); pageRef.current.__viewport = vp; }
    })();
    return () => { cancelled = true; };
  }, [page._pageIndex]);

  return (
    <div style={pageWrapperStyle} ref={pageRef} onMouseDown={() => onSelect?.(null)}>
      <canvas ref={canvasRef} style={pageCanvasStyle} />
      {viewport && overlays.filter((f) => f.pageIndex === pageIndex).map((f) => (
        <OverlayField key={f.id} field={f} onChange={onOverlayChange} onDelete={onDeleteOverlay} selected={f.id === selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ---------- Core helpers ----------
function mapPdfJsFieldType(t) {
  if (!t) return "text";
  if (t === "Tx") return "text";
  if (t === "Ch") return "dropdown";
  if (t === "Sig") return "text";
  if (t === "Btn") return "checkbox";
  return ("" + t).toLowerCase().includes("radio") ? "radio" : "text";
}

async function flattenWithPdfLib(originalBytes) {
  const pdfDoc = await PDFDocument.load(originalBytes);
  await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 1) Hard-delete form catalog + page annotations FIRST
  try {
    if (pdfDoc.catalog && pdfDoc.catalog.dict) pdfDoc.catalog.dict.delete(PDFName.of("AcroForm"));
    for (const page of pdfDoc.getPages()) {
      const node = page.node;
      if (node && node.dict) node.dict.delete(PDFName.of("Annots"));
    }
  } catch (_) {
    // best-effort cleanup
  }

  // 2) THEN attempt to flatten whatever form representation pdf-lib still detects
  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch (_) {
    // If AcroForm is already removed or XFA, this is a no-op.
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

async function applyFields(flattenedBytes, overlays, pages) {
  const pdfDoc = await PDFDocument.load(flattenedBytes);
  const form = pdfDoc.getForm();
  const pdfPages = pdfDoc.getPages();

  for (const ov of overlays) {
    const targPage = pdfPages[ov.pageIndex];
    const pdfjsPage = pages[ov.pageIndex];
    const viewport = pdfjsPage.getViewport({ scale: 1.5, rotation: pdfjsPage.rotate });
    const r = viewportToPdfRectFromViewportRect(ov.x, ov.y, ov.width, ov.height, viewport);

    if (ov.type === "text" || ov.type === "date" || ov.type === "dropdown") {
      const field = form.createTextField(ov.name || `Text_${ov.id}`);
      field.addToPage(targPage, { x: r.x, y: r.y, width: r.width, height: r.height });
      if (ov.value) field.setText(String(ov.value));
    } else if (ov.type === "checkbox") {
      const field = form.createCheckBox(ov.name || `Check_${ov.id}`);
      const s = Math.max(12, Math.min(r.width, r.height));
      field.addToPage(targPage, { x: r.x, y: r.y, width: s, height: s });
      if (ov.value) field.check(); else field.uncheck();
    } else if (ov.type === "radio") {
      const group = form.createRadioGroup(ov.name || `Radio_${ov.id}`);
      const s = Math.max(12, Math.min(r.width, r.height));
      group.addOptionToPage("on", targPage, { x: r.x, y: r.y, width: s, height: s });
      if (ov.value) group.select("on");
    }
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

// ---------- App ----------
function App() {
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [flattenedBytes, setFlattenedBytes] = useState(null);
  const [overlays, setOverlays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testLog, setTestLog] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const [dragging, setDragging] = useState(null); // 'left' | 'right' | null
  const shellRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      const tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteOverlay(selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  // Sidebar resizing handlers
  useEffect(() => {
    function onMove(e) {
      if (!dragging) return;
      const shell = shellRef.current; if (!shell) return;
      const rect = shell.getBoundingClientRect();
      if (dragging === 'left') {
        const min = 180, max = Math.max(240, rect.width - rightWidth - 240);
        const next = Math.min(max, Math.max(min, e.clientX - rect.left));
        setLeftWidth(next);
      } else if (dragging === 'right') {
        const min = 200, max = Math.max(240, rect.width - leftWidth - 240);
        const next = Math.min(max, Math.max(min, rect.right - e.clientX));
        setRightWidth(next);
      }
      e.preventDefault();
    }
    function onUp() { setDragging(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    if (dragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, leftWidth, rightWidth]);

  async function extractFieldsWithPdfJs(bytesForPdfjs) {
    const pdf = await pdfjsLib.getDocument({ data: bytesForPdfjs }).promise;
    const pageList = []; const extracted = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); pageList.push(page);
      const anns = await page.getAnnotations();
      const viewport = page.getViewport({ scale: 1.5, rotation: page.rotate });
      anns.filter(a => a.subtype === "Widget").forEach((a, idx) => {
        const rect = pdfRectToViewportRect(a.rect, viewport);
        const t = a.fieldType || a.widgetType || "text";
        const name = a.fieldName || a.alternativeText || `Field_${i}_${idx}`;
        const value = a.fieldValue ?? "";
        const mappedType = mapPdfJsFieldType(t);
        if (mappedType === "checkbox" || mappedType === "radio") {
          const s = Math.max(12, Math.min(rect.width, rect.height));
          extracted.push({ id: `${i}_${idx}_${name}`, pageIndex: i - 1, type: mappedType, name, value, x: rect.x, y: rect.y, width: s, height: s });
        } else {
          extracted.push({ id: `${i}_${idx}_${name}`, pageIndex: i - 1, type: mappedType, name, value, x: rect.x, y: rect.y, width: Math.max(40, rect.width), height: Math.max(20, rect.height) });
        }
      });
    }
    setPages(pageList); return extracted;
  }

  async function onFileSelected(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setLoading(true); setFile(f);

    // Read once
    const ab = await blobToArrayBuffer(f);

    // Extract existing widgets using a clone for PDF.js
    const existing = await extractFieldsWithPdfJs(toUint8(ab));

    // Hard-delete + flatten for base/preview
    const flat = await flattenWithPdfLib(ab);
    setFlattenedBytes(flat.slice()); // keep safe copy

    // Preview from another clone and verify no Widget annotations remain
    const flatDoc = await pdfjsLib.getDocument({ data: flat.slice() }).promise;
    const flatPages = []; let widgetCount = 0;
    for (let i = 1; i <= flatDoc.numPages; i++) { const p = await flatDoc.getPage(i); const anns = await p.getAnnotations(); widgetCount += anns.filter(a => a.subtype === 'Widget').length; flatPages.push(p); }
    setPages(flatPages); if (widgetCount > 0) console.warn("Flatten check:", widgetCount, "widgets remained");

    // Seed overlays from extracted
    setOverlays(existing);
    setSelectedId(existing[0]?.id || null);
    setLoading(false);
  }

  function addField(type) {
    if (!pages.length) return;
    const isTick = type === "checkbox" || type === "radio";
    const id = `new_${Date.now()}`;
    setOverlays(prev => [
      ...prev,
      {
        id,
        pageIndex: 0,
        type,
        name: "",
        value: isTick ? false : "",
        x: 60,
        y: 60,
        width: isTick ? 16 : 160,
        height: isTick ? 16 : 28,
      },
    ]);
    // Select the newly added field
    setSelectedId(id);
  }

  function updateOverlay(next) { setOverlays(prev => prev.map(o => o.id === next.id ? next : o)); setSelectedId(next.id); }
  function deleteOverlay(id) { setOverlays(prev => prev.filter(o => o.id !== id)); if (selectedId === id) setSelectedId(null); }

  async function applyAndDownload() {
    if (!flattenedBytes || !pages.length) return;
    const out = await applyFields(flattenedBytes, overlays, pages);
    downloadBlob(new Blob([out], { type: "application/pdf" }), (file?.name || "document").replace(/\.pdf$/i, "") + ".with-fields.pdf");
  }

  // ---------- Self-tests ----------
  async function runSelfTests() {
    const logs = []; const ok = (m) => logs.push("✔ " + m); const fail = (m) => logs.push("✘ " + m);
    try {
      // A) Extract -> flatten -> re-apply
      const gen = await PDFDocument.create(); const p = gen.addPage([612, 792]); const form = gen.getForm();
      form.createTextField("Name").addToPage(p, { x: 72, y: 700, width: 200, height: 24 });
      form.createCheckBox("Agree").addToPage(p, { x: 72, y: 660, width: 16, height: 16 });
      const bytes = await gen.save();
      const overlays1 = await (async () => {
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; const page = await pdf.getPage(1);
        const anns = await page.getAnnotations(); const v = page.getViewport({ scale: 1.5, rotation: page.rotate });
        return anns.filter(a=>a.subtype==='Widget').map((a, i)=>{ const r = pdfRectToViewportRect(a.rect, v); return { id:`t${i}`, pageIndex:0, type: mapPdfJsFieldType(a.fieldType), name: a.fieldName, value: a.fieldValue ?? "", x:r.x, y:r.y, width:r.width, height:r.height }; });
      })();
      if (overlays1.length >= 2) ok("extracted ≥2 widgets"); else fail("extraction missing widgets");
      const flat = await flattenWithPdfLib(bytes);
      const docFlat = await PDFDocument.load(flat); if (docFlat.getForm().getFields().length === 0) ok("zero fields after delete+flatten"); else fail("pdf-lib still reports fields");
      const pdfFlat = await pdfjsLib.getDocument({ data: flat.slice() }).promise; const pg1 = await pdfFlat.getPage(1); const w = (await pg1.getAnnotations()).filter(a=>a.subtype==='Widget').length; if (w===0) ok("no Widget annotations after flatten"); else fail("widgets remain:"+w);
      const applied = await applyFields(flat, overlays1, [pg1]); const out = await PDFDocument.load(applied); if (out.getForm().getFields().length >= overlays1.length) ok("re-applied fields count ≥ overlays"); else fail("re-applied count mismatch");
      if (applied && applied.byteLength > 0) ok("output bytes non-empty"); else fail("output empty");

      // B) Multi-page widget removal
      const g2 = await PDFDocument.create(); const p1 = g2.addPage([300,300]); const p2 = g2.addPage([300,300]); const f2 = g2.getForm(); f2.createTextField("P2").addToPage(p2,{x:50,y:200,width:120,height:20});
      const b2 = await g2.save(); const flat2 = await flattenWithPdfLib(b2); const d2 = await pdfjsLib.getDocument({ data: flat2.slice() }).promise; const q1 = await d2.getPage(1); const q2 = await d2.getPage(2);
      const w1 = (await q1.getAnnotations()).filter(a=>a.subtype==='Widget').length; const w2 = (await q2.getAnnotations()).filter(a=>a.subtype==='Widget').length; if (w1===0 && w2===0) ok("widgets removed on all pages"); else fail(`widgets remain p1=${w1} p2=${w2}`);

      // C) Coordinate round-trip
      const v = pg1.getViewport({ scale: 1.5, rotation: pg1.rotate }); const vx=100, vy=150, vw=120, vh=30; const rp = viewportToPdfRectFromViewportRect(vx,vy,vw,vh,v); const back = pdfRectToViewportRect([rp.x,rp.y,rp.x+rp.width,rp.y+rp.height], v); const dx = Math.abs(back.x-vx)+Math.abs(back.y-vy)+Math.abs(back.width-vw)+Math.abs(back.height-vh); if (dx < 0.5) ok("viewport↔pdf within 0.5px"); else fail("conversion drift "+dx.toFixed(3)+"px");

      setTestLog(logs.join("\n"));
    } catch (err) {
      setTestLog((prev)=> (prev?prev+"\n":"") + ("✘ Test run error: "+(err?.message||String(err))));
    }
  }

  const selectedField = overlays.find(o => o.id === selectedId) || null;

  return (
    <div className="app-shell" ref={shellRef} style={{ gridTemplateColumns: `${leftWidth}px 6px 1fr 6px ${rightWidth}px` }}>
      <LeftSidebar pages={pages} overlays={overlays} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="resizer resizer-left" onMouseDown={() => setDragging('left')} title="Resize sidebar" />
      <main className="main">
        <header className="topbar">
          <div className="title">PDF Form Extract → Edit → Apply</div>
          <div className="actions">
            <input type="file" accept="application/pdf" onChange={onFileSelected} className="file-input" />
            <Toolbar onApply={applyAndDownload} onAddField={addField} onRunTests={runSelfTests} disableApply={!pages.length} />
          </div>
        </header>
        <section className="viewer">
          {loading && <div className="loading">Processing…</div>}
          {!loading && pages.length > 0 && (
            <div className="page-list">
              {pages.map((p, i) => (
                <PageLayer key={i} page={p} pageIndex={i} overlays={overlays} onOverlayChange={updateOverlay} onDeleteOverlay={deleteOverlay} onSelect={setSelectedId} selectedId={selectedId} />
              ))}
            </div>
          )}
          {!pages.length && (
            <p className="empty-hint">Upload a PDF to begin editing fields.</p>
          )}
          {testLog && (<pre className="test-log">{testLog}</pre>)}
        </section>
      </main>
      <div className="resizer resizer-right" onMouseDown={() => setDragging('right')} title="Resize sidebar" />
      <RightSidebar field={selectedField} pagesCount={pages.length} onChange={updateOverlay} onDelete={deleteOverlay} />
      <style>{`
        html, body, #root { height:100%; }
        body { margin:0; overflow:hidden; }
        .app-shell{ display:grid; grid-template-columns:260px 6px 1fr 6px 300px; height:100vh; font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif }
        .main{ display:flex; flex-direction:column; min-width:0; height:100vh }
        .topbar{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; background:white; position:sticky; top:0; z-index:10 }
        .title{ font-size:16px; font-weight:600; color:#111827 }
        .actions{ display:flex; align-items:center; gap:10px }
        .file-input{ margin:0 }
        .viewer{ padding:12px; overflow:auto; flex:1; min-height:0 }
        .loading{ color:#2563eb; font-weight:500 }
        .page-list{ display:flex; flex-direction:column; gap:20px; align-items:center }
        .empty-hint{ color:#6b7280; font-style:italic; padding:12px }
        .test-log{ background:#111827; color:#d1fae5; padding:12px; border-radius:8px; margin-top:12px; white-space:pre-wrap; font-size:13px }
        .resizer{ background:transparent; cursor:col-resize }
        .resizer:hover{ background:#e5e7eb }
      `}</style>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);

export default App;
