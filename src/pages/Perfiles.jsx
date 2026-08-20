import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase, profileAuthClient } from "../lib/supabase";
import { colors, fonts, FONT_IMPORT } from "../styles/theme";

const initial = { nombre: "", email: "", password: "", rol: "ventas" };

export default function Perfiles() {
  const [perfiles, setPerfiles] = useState([]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("perfiles")
      .select("id,nombre,rol,created_at")
      .order("nombre");
    if (error) alert(error.message);
    setPerfiles(data || []);
    setLoading(false);
  }

  async function crear(e) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (!nombre || !email || !password) {
      alert("Completa nombre, correo y contraseña.");
      return;
    }
    if (password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSaving(true);
    try {
      // Crea el usuario usando el mismo Supabase del proyecto, sin Edge Function.
      // Este cliente secundario no reemplaza la sesión del administrador.
      const { data, error } = await profileAuthClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.user?.id) {
        throw new Error("Supabase no devolvió el usuario creado.");
      }

      // El trigger crea el perfil base como "ventas". Aquí, la sesión del admin
      // actualiza el rol solicitado sin tocar su sesión.
      const { error: rolError } = await supabase
        .from("perfiles")
        .update({ nombre, rol: form.rol })
        .eq("id", data.user.id);

      if (rolError) {
        throw new Error(`El usuario se creó, pero no se pudo guardar el rol: ${rolError.message}`);
      }

      setForm(initial);
      await cargar();

      if (!data.session) {
        alert("Perfil creado correctamente. Si tu proyecto tiene activada la confirmación por correo, el usuario deberá confirmar su correo antes de iniciar sesión.");
      } else {
        alert("Perfil creado correctamente.");
      }
    } catch (error) {
      console.error("Error creando perfil:", error);
      alert(error.message || "No se pudo crear el perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: fonts.body, background: colors.bg, minHeight: "100vh", display: "flex", color: colors.text }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar />
      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1000 }}>
        <div data-mobile-stack="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 600, margin: 0, color: colors.plum }}>Perfiles</p>
            <p style={{ fontSize: 13.5, color: colors.textSoft, margin: "4px 0 0" }}>Crea cuentas para administradores y vendedores.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: 20 }}>
          <form onSubmit={crear} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
            <p style={{ fontFamily: fonts.display, fontSize: 17, fontWeight: 600, color: colors.plum, margin: "0 0 16px" }}>Nuevo perfil</p>
            {[['nombre','Nombre'],['email','Correo'],['password','Contraseña']].map(([key,label]) => (
              <div key={key} style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textSoft, fontWeight: 600 }}>{label}</label>
                <input type={key === 'password' ? 'password' : key === 'email' ? 'email' : 'text'} value={form[key]} onChange={(e)=>setForm({ ...form, [key]: e.target.value })} style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, fontSize: 13.5, outline: "none" }} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textSoft, fontWeight: 600 }}>Rol</label>
              <select value={form.rol} onChange={(e)=>setForm({ ...form, rol: e.target.value })} style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, fontSize: 13.5 }}>
                <option value="ventas">Ventas</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <button disabled={saving} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: colors.rose, color: colors.plum, fontSize: 14, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? .7 : 1 }}>
              {saving ? "Creando..." : "Crear perfil"}
            </button>
          </form>

          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }} data-scroll-table="true">
            <p style={{ fontFamily: fonts.display, fontSize: 17, fontWeight: 600, color: colors.plum, margin: "0 0 14px" }}>Perfiles existentes</p>
            {loading ? <p style={{ color: colors.textFaint }}>Cargando...</p> : perfiles.length === 0 ? <p style={{ color: colors.textFaint }}>No hay perfiles.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{['Nombre','Rol','Creado'].map(h=><th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11.5, color:colors.textSoft, textTransform:'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>{perfiles.map(p=><tr key={p.id} style={{ borderTop:`1px solid ${colors.borderLight}` }}><td style={{padding:'12px 8px', fontWeight:500}}>{p.nombre}</td><td style={{padding:'12px 8px'}}><span style={{fontSize:11.5,padding:'3px 8px',borderRadius:12,background:p.rol==='admin'?colors.amberBg:colors.sageBg,color:p.rol==='admin'?colors.amber:colors.sageText}}>{p.rol==='admin'?'Administrador':'Ventas'}</span></td><td style={{padding:'12px 8px',color:colors.textFaint,fontSize:12}}>{new Date(p.created_at).toLocaleDateString('es-PE')}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
