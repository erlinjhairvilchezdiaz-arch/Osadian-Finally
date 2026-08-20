import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { colors, fonts } from "../styles/theme";

const allItems = [
  { to: "/", icon: "ti-layout-dashboard", label: "Dashboard", soloAdmin: false },
  { to: "/inventario", icon: "ti-package", label: "Inventario", soloAdmin: false },
  { to: "/ventas", icon: "ti-shopping-cart", label: "Ventas", soloAdmin: false },
  { to: "/caja", icon: "ti-cash", label: "Caja", soloAdmin: true },
  { to: "/reportes", icon: "ti-chart-bar", label: "Reportes", soloAdmin: true },
  { to: "/historial-ventas", icon: "ti-history", label: "Historial", soloAdmin: true },
  { to: "/perfiles", icon: "ti-users", label: "Perfiles", soloAdmin: true },
];

export default function Sidebar() {
  const { perfil, esAdmin, logout } = useAuth();
  const items = allItems.filter((i) => !i.soloAdmin || esAdmin);
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth <= 820);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth <= 820;
      setMobile(isMobile);
      if (!isMobile) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobile, open]);

  const nav = (
    <>
      <div style={{ padding: "0 8px 28px" }}>
        <img
          src="/logo.png"
          alt="Logo"
          onError={(e) => { e.currentTarget.style.display = "none"; const t=document.getElementById("sidebar-title"); if(t)t.style.display="block"; }}
          style={{ maxWidth: 150, maxHeight: 52, objectFit: "contain", marginBottom: 2 }}
        />
        <p id="sidebar-title" style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 20, color: colors.bg, margin: 0, display: "none" }}>Sistema POS</p>
        <p style={{ fontSize: 11.5, color: colors.rose, margin: "2px 0 0", letterSpacing: "0.04em" }}>Punto de venta</p>
      </div>

      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => mobile && setOpen(false)}
          style={({ isActive }) => ({
            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
            background: isActive ? colors.rose : "transparent", cursor: "pointer", textDecoration: "none",
          })}
        >
          {({ isActive }) => (
            <>
              <i className={`ti ${item.icon}`} style={{ fontSize: 18, color: isActive ? colors.plum : colors.roseText }} aria-hidden="true" />
              <span style={{ fontSize: 14, fontWeight: 500, color: isActive ? colors.plum : colors.roseText }}>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}

      <div style={{ marginTop: "auto", padding: "12px 8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${colors.plumBorder}`, paddingTop: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: esAdmin ? colors.gold : colors.sage, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: esAdmin ? colors.plum : colors.bg }}>
            {perfil?.nombre?.charAt(0) || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: colors.bg, margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{perfil?.nombre || "Usuario"}</p>
            <p style={{ fontSize: 11, color: "#A98E96", margin: 0 }}>{esAdmin ? "Administradora" : "Ventas"}</p>
          </div>
          <i onClick={logout} className="ti ti-logout" title="Cerrar sesión" style={{ fontSize: 16, color: "#A98E96", cursor: "pointer" }} aria-hidden="true" />
        </div>
      </div>
    </>
  );

  if (mobile) {
    return (
      <>
        <button
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          style={{ position: "fixed", top: 12, left: 12, zIndex: 1000, width: 42, height: 42, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.card, color: colors.plum, boxShadow: "0 6px 20px rgba(61,36,54,.12)", cursor: "pointer" }}
        ><i className="ti ti-menu-2" style={{ fontSize: 20 }} /></button>
        {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(25,15,22,.38)", zIndex: 998 }} />}
        <aside style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 250, background: colors.plum, padding: "28px 18px", display: "flex", flexDirection: "column", gap: 4, zIndex: 999, transform: open ? "translateX(0)" : "translateX(-105%)", transition: "transform .22s ease", boxShadow: "8px 0 32px rgba(0,0,0,.2)" }}>
          <button aria-label="Cerrar menú" onClick={() => setOpen(false)} style={{ alignSelf: "flex-end", background: "transparent", border: "none", color: colors.roseText, cursor: "pointer", fontSize: 20, marginBottom: 4 }}><i className="ti ti-x" /></button>
          {nav}
        </aside>
      </>
    );
  }

  return <aside style={{ width: 220, background: colors.plum, padding: "28px 18px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, minHeight: "100vh" }}>{nav}</aside>;
}
