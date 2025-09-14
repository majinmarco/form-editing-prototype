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
function Toolbar({ onApply, onAddField, onRunTests, disableApply }) {
  return (
    <div className="toolbar">
      <button onClick={() => onAddField("text")} className="btn">Text</button>
      <button onClick={() => onAddField("checkbox")} className="btn">Checkbox</button>
      <button onClick={() => onAddField("radio")} className="btn">Radio</button>
      <button onClick={() => onAddField("dropdown")} className="btn">Dropdown</button>
      <button onClick={() => onAddField("date")} className="btn">Date</button>
      <button onClick={onApply} disabled={disableApply} className="btn primary">Apply & Download</button>
      <button onClick={onRunTests} className="btn">Run Tests</button>
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

function OverlayField({ field, onChange, onDelete }) {
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
      })
      .resizable({
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

    return () => interact(el).unset();
  }, [field, onChange]);

  const body = (() => {
    switch (field.type) {
      case "text":
      case "date":
      case "dropdown":
        return (
          <input
            type={field.type === "date" ? "date" : "text"}
            value={field.value ?? ""}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
            className="field-input"
          />
        );
      case "checkbox":
        return (
          <input type="checkbox" checked={!!field.value} onChange={(e) => onChange({ ...field, value: e.target.checked })} />
        );
      case "radio":
        return (
          <input type="radio" checked={!!field.value} onChange={(e) => onChange({ ...field, value: e.target.checked })} />
        );
      default:
        return null;
    }
  })();

  return (
    <div
      ref={ref}
      className="overlay-field"
      style={{ position: "absolute", left: field.x, top: field.y, width: field.width, height: field.height }}
      title={`${field.type}${field.name ? ` • ${field.name}` : ""}`}
    >
      {body}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(field.id); }}
        className="delete-btn"
        aria-label="Delete field"
      >
        &times;
      </button>
      <div className="field-label">{field.type}</div>
      <style>{`
        .overlay-field { background: rgba(59,130,246,0.15); border: 1px solid #3b82f6; border-radius: 6px; display:flex; align-items:center; justifyContent:center; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.12) }
        .field-input { width:100%; height:100%; border:none; outline:none; background:transparent; padding:4px; font-size:12px }
        .delete-btn { position:absolute; top:-10px; right:-10px; background:#ef4444; color:#fff; border-radius:50%; border:0; width:22px; height:22px; cursor:pointer; font-size:14px; line-height:18px }
        .field-label { position:absolute; left:2px; bottom:2px; font-size:10px; color:#111827; background:rgba(255,255,255,.8); padding:0 3px; border-radius:3px }
      `}</style>
    </div>
  );
}

function PageLayer({ page, pageIndex, overlays, onOverlayChange, onDeleteOverlay }) {
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
    <div style={pageWrapperStyle} ref={pageRef}>
      <canvas ref={canvasRef} style={pageCanvasStyle} />
      {viewport && overlays.filter((f) => f.pageIndex === pageIndex).map((f) => (
        <OverlayField key={f.id} field={f} onChange={onOverlayChange} onDelete={onDeleteOverlay} />
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
      field.addToPage(targPage, { x: r.x, y: r.y, width: Math.max(12, r.width), height: Math.max(12, r.height) });
      if (ov.value) field.check(); else field.uncheck();
    } else if (ov.type === "radio") {
      const group = form.createRadioGroup(ov.name || `Radio_${ov.id}`);
      group.addOptionToPage("on", targPage, { x: r.x, y: r.y, width: Math.max(12, r.width), height: Math.max(12, r.height) });
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
        extracted.push({ id: `${i}_${idx}_${name}`, pageIndex: i - 1, type: mapPdfJsFieldType(t), name, value, x: rect.x, y: rect.y, width: Math.max(40, rect.width), height: Math.max(20, rect.height) });
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
    setLoading(false);
  }

  function addField(type) {
    if (!pages.length) return;
    setOverlays(prev => [ ...prev, { id: `new_${Date.now()}`, pageIndex: 0, type, name: "", value: type === "checkbox" || type === "radio" ? false : "", x: 60, y: 60, width: 160, height: 28 } ]);
  }

  function updateOverlay(next) { setOverlays(prev => prev.map(o => o.id === next.id ? next : o)); }
  function deleteOverlay(id) { setOverlays(prev => prev.filter(o => o.id !== id)); }

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

  return (
    <div className="app-container">
      <h1 className="app-title">PDF Form Extract → Edit → Apply</h1>
      <input type="file" accept="application/pdf" onChange={onFileSelected} className="file-input" />
      <Toolbar onApply={applyAndDownload} onAddField={addField} onRunTests={runSelfTests} disableApply={!pages.length} />
      {loading && <div className="loading">Processing…</div>}
      {!loading && pages.length > 0 && (
        <div className="page-list">
          {pages.map((p, i) => (
            <PageLayer key={i} page={p} pageIndex={i} overlays={overlays} onOverlayChange={updateOverlay} onDeleteOverlay={deleteOverlay} />
          ))}
        </div>
      )}
      {!pages.length && (
        <p className="empty-hint">Upload a PDF to begin editing fields.</p>
      )}
      {testLog && (<pre className="test-log">{testLog}</pre>)}
      <style>{`
        .app-container{ max-width:1100px; margin:20px auto; padding:16px; font-family:system-ui, sans-serif }
        .app-title{ font-size:24px; font-weight:600; margin-bottom:12px; color:#111827 }
        .file-input{ margin-bottom:12px }
        .loading{ color:#2563eb; font-weight:500 }
        .page-list{ display:flex; flex-direction:column; gap:20px }
        .empty-hint{ color:#6b7280; font-style:italic }
        .test-log{ background:#111827; color:#d1fae5; padding:12px; border-radius:8px; margin-top:12px; white-space:pre-wrap; font-size:13px }
      `}</style>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);

export default App;
