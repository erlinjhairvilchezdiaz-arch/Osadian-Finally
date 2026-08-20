import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { colors, fonts, FONT_IMPORT } from "../styles/theme";

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HistorialVentas() {
  const { esAdmin } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [editar, setEditar] = useState(null);
  const [fechaTemp, setFechaTemp] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ventas")
      .select("id, fecha, total, metodo_pago, anulada, usuario_id, perfiles(nombre, rol)")
      .eq("anulada", false)
      .order("fecha", { ascending: false });
    if (error) alert(error.message);
    setVentas(data || []);
    setLoading(false);
  }

  const visibles = ventas.filter((v) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return String(v.id).includes(q) || (v.perfiles?.nombre || "").toLowerCase().includes(q) || (v.metodo_pago || "").toLowerCase().includes(q);
  });

  async function guardarFecha() {
    if (!editar || !fechaTemp) return;
    setSaving(true);
    const { error } = await supabase.rpc("modificar_fecha_venta", {
      p_venta_id: editar.id,
      p_nueva_fecha: new Date(fechaTemp).toISOString(),
    });
    if (error) alert(error.message);
    else {
      setEditar(null);
      await cargar();
    }
    setSaving(false);
  }

  async function eliminarVenta(venta) {
    if (deleting) return;
    const ok = window.confirm(
      `¿Eliminar la venta #${venta.id}?\n\n` +
      `Total: S/ ${Number(venta.total).toFixed(2)}\n` +
      `Atendió: ${venta.perfiles?.nombre || "Sin perfil"}\n\n` +
      `Esta acción devolverá el stock vendido y eliminará el movimiento de caja asociado.`
    );
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase.rpc("eliminar_venta", {
      p_venta_id: venta.id,
    });
    if (error) {
      alert(error.message);
    } else {
      await cargar();
      alert("Venta eliminada correctamente.");
    }
    setDeleting(false);
  }

  return (
    <div style={{ fontFamily: fonts.body, background: colors.bg, minHeight: "100vh", display: "flex", color: colors.text }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar />
      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1150 }}>
        <div data-mobile-stack="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 600, margin: 0, color: colors.plum }}>Historial de ventas</p>
            <p style={{ fontSize: 13.5, color: colors.textSoft, margin: "4px 0 0" }}>Consulta las ventas y quién atendió cada compra.</p>
          </div>
          <button onClick={cargar} style={{ border: "none", background: colors.sageBg, color: colors.sageText, borderRadius: 20, padding: "8px 14px", cursor: "pointer" }}><i className="ti ti-refresh" /> Actualizar</button>
        </div>

        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por número, vendedor o método de pago..." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, fontSize: 13.5, outline: "none" }} />
        </div>

        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }} data-scroll-table="true">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: colors.bg }}>
                {['Venta', 'Fecha', 'Atendió', 'Método', 'Total', 'Acción'].map((h) => <th key={h} style={{ textAlign: h === 'Total' ? 'right' : 'left', padding: "12px 14px", fontSize: 11.5, color: colors.textSoft, textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" style={{ padding: 20, color: colors.textFaint }}>Cargando...</td></tr>}
              {!loading && visibles.length === 0 && <tr><td colSpan="6" style={{ padding: 20, color: colors.textFaint }}>No hay ventas que coincidan.</td></tr>}
              {!loading && visibles.map((v) => (
                <tr key={v.id} style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: "13px 14px", fontWeight: 600 }}>#{v.id}</td>
                  <td style={{ padding: "13px 14px", color: colors.textSoft }}>
                    {new Date(v.fecha).toLocaleDateString("es-PE")} · {new Date(v.fecha).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "13px 14px" }}>{v.perfiles?.nombre || "Sin perfil"}</td>
                  <td style={{ padding: "13px 14px" }}><span style={{ background: colors.sageBg, color: colors.sageText, padding: "4px 9px", borderRadius: 12, fontSize: 11.5 }}>{v.metodo_pago}</span></td>
                  <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 600 }}>S/ {Number(v.total).toFixed(2)}</td>
                  <td style={{ padding: "13px 14px" }}>
                    {esAdmin ? (
                      <div style={{ display: "flex", gap: 7 }}>
                        <button onClick={() => { setEditar(v); setFechaTemp(toLocalInputValue(v.fecha)); }} title="Modificar fecha" style={{ border: "none", background: colors.amberBg, color: colors.amber, width: 34, height: 34, borderRadius: 8, cursor: "pointer" }}>
                          <i className="ti ti-calendar-edit" />
                        </button>
                        <button onClick={() => eliminarVenta(v)} disabled={deleting} title="Eliminar venta" style={{ border: "none", background: colors.redBg, color: colors.red, width: 34, height: 34, borderRadius: 8, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? .6 : 1 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 11.5, color: colors.textFaint }}>Solo lectura</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {editar && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(25,15,22,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
          <div style={{ width: "min(420px, 100%)", background: colors.card, borderRadius: 12, padding: 24 }}>
            <p style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 600, color: colors.plum, margin: 0 }}>Modificar fecha de venta</p>
            <p style={{ color: colors.textSoft, fontSize: 13, margin: "5px 0 18px" }}>Venta #{editar.id} · {editar.perfiles?.nombre || "Sin perfil"}</p>
            <label style={{ fontSize: 11.5, textTransform: "uppercase", color: colors.textSoft, fontWeight: 600 }}>Fecha y hora</label>
            <input type="datetime-local" value={fechaTemp} onChange={(e) => setFechaTemp(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, fontSize: 13.5 }} />
            <p style={{ fontSize: 11.5, color: colors.textFaint, margin: "8px 0 18px" }}>También se actualizará la fecha del movimiento de caja asociado a esta venta.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditar(null)} style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.card, color: colors.textMuted, cursor: "pointer" }}>Cancelar</button>
              <button onClick={guardarFecha} disabled={saving} style={{ flex: 1, padding: 11, borderRadius: 8, border: "none", background: colors.plum, color: colors.bg, cursor: "pointer", opacity: saving ? .7 : 1 }}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
