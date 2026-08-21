import React, { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { colors, fonts, FONT_IMPORT } from "../styles/theme";

function StockBadge({ stock, minimo }) {
  let bg = colors.sageBg, color = colors.sageText, label = `${stock} und.`;
  if (stock === 0) { bg = colors.redBg; color = colors.red; label = "Agotado"; }
  else if (stock <= minimo) { bg = colors.amberBg; color = colors.amber; }
  return <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, padding: "3px 10px", borderRadius: 12, whiteSpace: "nowrap" }}>{label}</span>;
}

const emptyForm = { id: null, nombre: "", marca: "", categoria_id: "", precio: "", costo: "", stock: "", codigo_barras: "", stock_minimo: 3 };

function normHeader(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}
function findColumn(headers, aliases) {
  const normalized = headers.map(normHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(normHeader(alias));
    if (idx >= 0) return headers[idx];
  }
  return null;
}
function cleanText(v) { return v == null ? "" : String(v).trim(); }
function num(v, fallback = 0) {
  if (v == null || String(v).trim() === "") return fallback;
  const n = Number(String(v).replace(/,/g, ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export default function Inventario() {
  const [products, setProducts] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [query, setQuery] = useState("");
  const [catFiltro, setCatFiltro] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const [{ data: prods, error: prodError }, { data: cats }] = await Promise.all([
      supabase.from("productos").select("*, categorias(nombre)").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("*").order("nombre"),
    ]);
    if (prodError) console.error(prodError);
    setProducts(prods || []);
    setCategorias(cats || []);
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    const q = query.toLowerCase();
    return (p.nombre || "").toLowerCase().includes(q) || (p.marca || "").toLowerCase().includes(q) || (p.codigo_barras || "").toString().includes(query)
      ? (catFiltro === "Todas" || p.categorias?.nombre === catFiltro)
      : false;
  });

  function abrirEditar(p) {
    setForm({ id: p.id, nombre: p.nombre, marca: p.marca || "", categoria_id: p.categoria_id || "", precio: p.precio, costo: p.costo || 0, stock: p.stock, codigo_barras: p.codigo_barras || "", stock_minimo: p.stock_minimo });
    setShowForm(true);
  }

  async function guardar(e) {
    e.preventDefault(); setSaving(true);
    const payload = { nombre: form.nombre, marca: form.marca, categoria_id: form.categoria_id || null, precio: num(form.precio), costo: num(form.costo), stock: Math.max(0, Math.trunc(num(form.stock))), codigo_barras: form.codigo_barras || null, stock_minimo: Math.max(0, Math.trunc(num(form.stock_minimo, 3))) };
    const { error } = form.id ? await supabase.from("productos").update(payload).eq("id", form.id) : await supabase.from("productos").insert(payload);
    if (error) alert(error.message); else { setShowForm(false); setForm(emptyForm); await cargar(); }
    setSaving(false);
  }

  async function eliminar(id) {
    if (!confirm("¿Eliminar este producto?")) return;
    const { error } = await supabase.from("productos").update({ activo: false }).eq("id", id);
    if (error) alert(error.message); else cargar();
  }

  async function importarExcel(file) {
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      if (!window.XLSX) throw new Error("No se cargó el lector de Excel. Revisa tu conexión a internet y vuelve a cargar la página.");
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const headerIndex = rows.findIndex((r) => {
        const joined = r.map(normHeader).join("|");
        return joined.includes("NOMBRE") && (joined.includes("CATEGORIA") || joined.includes("CATEGORÍA")) && joined.includes("PRECIO VENTA");
      });
      if (headerIndex < 0) throw new Error("No encontré la fila de encabezados. Debe contener NOMBRE, PRECIO VENTA y CATEGORIA.");
      const headers = rows[headerIndex].map((h, i) => cleanText(h) || `COL_${i}`);
      const col = {
        nombre: findColumn(headers, ["NOMBRE", "PRODUCTO"]), marca: findColumn(headers, ["MARCA", "MARCA / PROVEEDOR", "PROVEEDOR"]),
        codigo: findColumn(headers, ["CÓDIGO DE BARRA", "CODIGO DE BARRA", "COODIGO DE BARRA", "CÓDIGO BARRAS", "CODIGO BARRAS", "CODIGO_BARRAS"]),
        precio: findColumn(headers, ["PRECIO VENTA", "PRECIO", "PRECIO DE VENTA"]), costo: findColumn(headers, ["COSTO DEL PRODUCTO", "COSTO", "COSTO PRODUCTO"]),
        stock: findColumn(headers, ["STOCK ACTUAL", "STOCK"]), minimo: findColumn(headers, ["STOCK MÍNIMO", "STOCK MINIMO", "STOCK_MINIMO"]), categoria: findColumn(headers, ["CATEGORÍA", "CATEGORIA"]),
      };
      if (!col.nombre || !col.precio || !col.categoria) throw new Error("Faltan columnas obligatorias: NOMBRE, PRECIO VENTA y CATEGORIA.");

      const records = rows.slice(headerIndex + 1).map((r) => ({
        nombre: cleanText(r[headers.indexOf(col.nombre)]), marca: cleanText(r[headers.indexOf(col.marca)]), codigo: cleanText(r[headers.indexOf(col.codigo)]), precio: num(r[headers.indexOf(col.precio)]), costo: num(r[headers.indexOf(col.costo)]), stock: Math.max(0, Math.trunc(num(r[headers.indexOf(col.stock)]))), minimo: Math.max(0, Math.trunc(num(r[headers.indexOf(col.minimo)], 3))), categoria: cleanText(r[headers.indexOf(col.categoria)]),
      })).filter((r) => r.nombre);
      const unique = []; const seen = new Set();
      for (const r of records) { const key = r.codigo || `name:${r.nombre.toUpperCase()}`; if (!seen.has(key)) { seen.add(key); unique.push(r); } }

      const categoryNames = [...new Set(unique.map(r => r.categoria).filter(Boolean))];
      if (categoryNames.length) {
        const { error: catError } = await supabase.from("categorias").insert(categoryNames.map(nombre => ({ nombre }))).select();
        if (catError && !catError.message.toLowerCase().includes("duplicate")) throw catError;
      }
      const { data: cats, error: catsError } = await supabase.from("categorias").select("id,nombre");
      if (catsError) throw catsError;
      const catMap = Object.fromEntries((cats || []).map(c => [normHeader(c.nombre), c.id]));
      const payload = unique.map(r => ({ nombre: r.nombre, marca: r.marca, categoria_id: catMap[normHeader(r.categoria)] || null, precio: r.precio, costo: r.costo, stock: r.stock, codigo_barras: r.codigo || null, stock_minimo: r.minimo, activo: true }));
      const withCode = payload.filter(r => r.codigo_barras); const withoutCode = payload.filter(r => !r.codigo_barras);
      let addedOrUpdated = 0;
      if (withCode.length) {
        const { error } = await supabase.from("productos").upsert(withCode, { onConflict: "codigo_barras" });
        if (error) throw error;
        addedOrUpdated += withCode.length;
      }
      if (withoutCode.length) {
        const { error } = await supabase.from("productos").insert(withoutCode);
        if (error) throw error;
        addedOrUpdated += withoutCode.length;
      }
      setImportResult({ ok: true, total: addedOrUpdated, file: file.name });
      await cargar();
    } catch (e) {
      console.error(e); setImportResult({ ok: false, error: e.message || "No se pudo importar el archivo." });
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div style={{ fontFamily: fonts.body, background: colors.bg, minHeight: "100vh", display: "flex", color: colors.text }}>
      <style>{FONT_IMPORT}</style><Sidebar />
      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1200 }}>
        <div data-mobile-stack="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, marginBottom: 24 }}>
          <div><p style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 600, margin: 0, color: colors.plum }}>Inventario</p><p style={{ fontSize: 13.5, color: colors.textSoft, margin: "4px 0 0" }}>{products.length} productos registrados</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => fileRef.current?.click()} disabled={importing} style={{ display: "flex", alignItems: "center", gap: 8, background: colors.card, color: colors.plum, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 13.5, fontWeight: 500, cursor: "pointer", opacity: importing ? .7 : 1 }}><i className="ti ti-file-spreadsheet" />{importing ? "Importando..." : "Importar Excel"}</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => importarExcel(e.target.files?.[0])} style={{ display: "none" }} />
            <button onClick={() => { setForm(emptyForm); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 8, background: colors.plum, color: colors.bg, border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}><i className="ti ti-plus" />Nuevo producto</button>
          </div>
        </div>

        {importResult && <div style={{ background: importResult.ok ? colors.sageBg : colors.redBg, color: importResult.ok ? colors.sageText : colors.red, borderRadius: 9, padding: "11px 14px", marginBottom: 14, fontSize: 13 }}>{importResult.ok ? `Excel importado correctamente: ${importResult.total} filas procesadas (${importResult.file}).` : `No se pudo importar: ${importResult.error}`}</div>}

        <div data-mobile-stack="true" style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360, minWidth: 220 }}><i className="ti ti-search" style={{ position: "absolute", left: 12, top: 11, fontSize: 16, color: colors.textFaint }} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, marca o código" style={{ width: "100%", padding: "9px 12px 9px 36px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.card, fontSize: 13.5, fontFamily: fonts.body, outline: "none" }} /></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["Todas", ...categorias.map(c => c.nombre)].map(c => <button key={c} onClick={() => setCatFiltro(c)} style={{ padding: "8px 14px", borderRadius: 20, border: `1px solid ${colors.border}`, fontSize: 12.5, fontWeight: 500, cursor: "pointer", background: catFiltro === c ? colors.plum : colors.card, color: catFiltro === c ? colors.bg : colors.textMuted }}>{c}</button>)}</div>
        </div>

        <div data-scroll-table="true" style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: colors.bg }}>{["Producto","Marca","Categoría","Costo","Precio","Margen","Stock",""] .map((h,i)=><th key={i} style={{ textAlign:i>=3?"right":"left", padding:"12px 16px", fontSize:11.5, letterSpacing:"0.04em", textTransform:"uppercase", color:colors.textSoft, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ padding:28, textAlign:"center", color:colors.textFaint }}>Cargando productos...</td></tr>}
              {!loading && filtered.map((p,i)=><tr key={p.id} style={{ borderTop:i===0?"none":`1px solid ${colors.borderLight}` }}><td style={{ padding:"12px 16px", fontWeight:500 }}>{p.nombre}</td><td style={{ padding:"12px 16px", color:colors.textMuted }}>{p.marca}</td><td style={{ padding:"12px 16px", color:colors.textMuted }}>{p.categorias?.nombre||"—"}</td><td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{p.costo > 0 ? <span style={{ fontSize: 12, fontWeight: 600, color: colors.sageText, background: colors.sageBg, padding: "3px 10px", borderRadius: 12, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>+S/ {(Number(p.precio) - Number(p.costo)).toFixed(2)}</span> : <span style={{ color: colors.textFaint, fontSize: 12 }}>—</span>}</td><td style={{padding:"12px 16px",textAlign:"right"}}><StockBadge stock={p.stock} minimo={p.stock_minimo}/></td><td style={{padding:"12px 16px",textAlign:"right",whiteSpace:"nowrap"}}><i onClick={()=>abrirEditar(p)} className="ti ti-edit" style={{fontSize:16,color:colors.textFaint,cursor:"pointer",marginRight:10}}/><i onClick={()=>eliminar(p.id)} className="ti ti-trash" style={{fontSize:16,color:colors.textFaint,cursor:"pointer"}}/></td></tr>)}
              {!loading && filtered.length===0 && <tr><td colSpan={8} style={{padding:28,textAlign:"center",color:colors.textFaint}}>No se encontraron productos.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      {showForm && <div style={{position:"fixed",inset:0,background:"rgba(61,36,54,.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:14}}><form onSubmit={guardar} style={{background:colors.card,borderRadius:12,padding:"26px 28px",width:"min(380px,100%)",maxHeight:"90vh",overflowY:"auto"}}><p style={{fontFamily:fonts.display,fontSize:18,fontWeight:600,margin:"0 0 18px",color:colors.plum}}>{form.id?"Editar producto":"Nuevo producto"}</p>{[{key:"nombre",label:"Nombre",type:"text",required:true},{key:"marca",label:"Marca / Proveedor",type:"text"},{key:"codigo_barras",label:"Código de barras",type:"text"},{key:"precio",label:"Precio de venta (S/)",type:"number"},{key:"costo",label:"Costo del producto (S/)",type:"number"},{key:"stock",label:"Stock actual",type:"number"},{key:"stock_minimo",label:"Stock mínimo (alerta)",type:"number"}].map(f=><div key={f.key} style={{marginBottom:12}}><label style={{fontSize:11.5,letterSpacing:".04em",textTransform:"uppercase",color:colors.textSoft,fontWeight:600}}>{f.label}</label><input type={f.type} required={f.required} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${colors.border}`,background:colors.bg,fontSize:13.5,fontFamily:fonts.body,outline:"none",marginTop:6}}/></div>)}<div style={{marginBottom:18}}><label style={{fontSize:11.5,letterSpacing:".04em",textTransform:"uppercase",color:colors.textSoft,fontWeight:600}}>Categoría</label><select value={form.categoria_id} onChange={e=>setForm({...form,categoria_id:e.target.value})} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${colors.border}`,background:colors.bg,fontSize:13.5,fontFamily:fonts.body,outline:"none",marginTop:6}}><option value="">Sin categoría</option>{categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div><div style={{display:"flex",gap:8}}><button type="button" onClick={()=>setShowForm(false)} style={{flex:1,padding:"11px 0",borderRadius:8,border:`1px solid ${colors.border}`,background:colors.card,color:colors.textMuted,fontSize:13.5,fontWeight:500,cursor:"pointer"}}>Cancelar</button><button type="submit" disabled={saving} style={{flex:1,padding:"11px 0",borderRadius:8,border:"none",background:colors.rose,color:colors.plum,fontSize:13.5,fontWeight:600,cursor:"pointer",opacity:saving?.7:1}}>{saving?"Guardando...":"Guardar"}</button></div></form></div>}
    </div>
  );
}
