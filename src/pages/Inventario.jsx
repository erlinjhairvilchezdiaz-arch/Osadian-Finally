import React, { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";
import { colors, fonts, FONT_IMPORT } from "../styles/theme";

// ============================================================
// COMPONENTE: BADGE DE STOCK
// ============================================================
function StockBadge({ stock, minimo }) {
  let bg = colors.sageBg;
  let color = colors.sageText;
  let label = `${stock} und.`;

  if (stock === 0) {
    bg = colors.redBg;
    color = colors.red;
    label = "Agotado";
  } else if (stock <= minimo) {
    bg = colors.amberBg;
    color = colors.amber;
  }

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        padding: "3px 10px",
        borderRadius: 12,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ============================================================
// FORMULARIO VACÍO
// ============================================================
const emptyForm = {
  id: null,
  nombre: "",
  marca: "",
  categoria_id: "",
  precio: "",
  costo: "",
  stock: "",
  codigo_barras: "",
  stock_minimo: 3,
};

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================
function normHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function findColumn(headers, aliases) {
  const normalizedHeaders = headers.map(normHeader);

  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normHeader(alias));

    if (index >= 0) {
      return headers[index];
    }
  }

  return null;
}

function cleanText(value) {
  return value == null ? "" : String(value).trim();
}

function num(value, fallback = 0) {
  if (value == null || String(value).trim() === "") {
    return fallback;
  }

  const number = Number(
    String(value)
      .replace(/,/g, ".")
      .replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(number) ? number : fallback;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
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

  // ==========================================================
  // CARGAR PRODUCTOS Y CATEGORÍAS
  // ==========================================================
  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);

    const [
      { data: prods, error: prodError },
      { data: cats, error: catError },
    ] = await Promise.all([
      supabase
        .from("productos")
        .select("*, categorias(nombre)")
        .eq("activo", true)
        .order("nombre"),

      supabase
        .from("categorias")
        .select("*")
        .order("nombre"),
    ]);

    if (prodError) {
      console.error("Error cargando productos:", prodError);
    }

    if (catError) {
      console.error("Error cargando categorías:", catError);
    }

    setProducts(prods || []);
    setCategorias(cats || []);
    setLoading(false);
  }

  // ==========================================================
  // FILTRAR PRODUCTOS
  // ==========================================================
  const filtered = products.filter((product) => {
    const search = query.toLowerCase();

    const matchesSearch =
      (product.nombre || "").toLowerCase().includes(search) ||
      (product.marca || "").toLowerCase().includes(search) ||
      (product.codigo_barras || "")
        .toString()
        .includes(query);

    const matchesCategory =
      catFiltro === "Todas" ||
      product.categorias?.nombre === catFiltro;

    return matchesSearch && matchesCategory;
  });

  // ==========================================================
  // ABRIR EDICIÓN
  // ==========================================================
  function abrirEditar(product) {
    setForm({
      id: product.id,
      nombre: product.nombre || "",
      marca: product.marca || "",
      categoria_id: product.categoria_id || "",
      precio: product.precio ?? "",
      costo: product.costo ?? "",
      stock: product.stock ?? "",
      codigo_barras: product.codigo_barras || "",
      stock_minimo: product.stock_minimo ?? 3,
    });

    setShowForm(true);
  }

  // ==========================================================
  // GUARDAR PRODUCTO
  // ==========================================================
  async function guardar(event) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      nombre: form.nombre.trim(),
      marca: form.marca.trim(),
      categoria_id: form.categoria_id || null,

      // IMPORTANTE: convertir correctamente a número
      precio: num(form.precio),
      costo: num(form.costo),

      stock: Math.max(
        0,
        Math.trunc(num(form.stock))
      ),

      codigo_barras: form.codigo_barras.trim() || null,

      stock_minimo: Math.max(
        0,
        Math.trunc(num(form.stock_minimo, 3))
      ),
    };

    const result = form.id
      ? await supabase
          .from("productos")
          .update(payload)
          .eq("id", form.id)
      : await supabase
          .from("productos")
          .insert(payload);

    if (result.error) {
      alert(result.error.message);
    } else {
      setShowForm(false);
      setForm(emptyForm);
      await cargar();
    }

    setSaving(false);
  }

  // ==========================================================
  // ELIMINAR PRODUCTO
  // ==========================================================
  async function eliminar(id) {
    if (!confirm("¿Eliminar este producto?")) {
      return;
    }

    const { error } = await supabase
      .from("productos")
      .update({ activo: false })
      .eq("id", id);

    if (error) {
      alert(error.message);
    } else {
      await cargar();
    }
  }

  // ==========================================================
  // IMPORTAR EXCEL
  // ==========================================================
  async function importarExcel(file) {
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      if (!window.XLSX) {
        throw new Error(
          "No se cargó el lector de Excel. Revisa tu conexión a internet y vuelve a cargar la página."
        );
      }

      const buffer = await file.arrayBuffer();

      const workbook = window.XLSX.read(buffer, {
        type: "array",
        cellDates: false,
      });

      const sheet =
        workbook.Sheets[workbook.SheetNames[0]];

      const rows = window.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });

      // --------------------------------------------------------
      // BUSCAR ENCABEZADOS
      // --------------------------------------------------------
      const headerIndex = rows.findIndex((row) => {
        const joined = row.map(normHeader).join("|");

        return (
          joined.includes("NOMBRE") &&
          (joined.includes("CATEGORIA") ||
            joined.includes("CATEGORÍA")) &&
          joined.includes("PRECIO VENTA")
        );
      });

      if (headerIndex < 0) {
        throw new Error(
          "No encontré la fila de encabezados. Debe contener NOMBRE, PRECIO VENTA y CATEGORIA."
        );
      }

      const headers = rows[headerIndex].map(
        (header, index) =>
          cleanText(header) || `COL_${index}`
      );

      // --------------------------------------------------------
      // IDENTIFICAR COLUMNAS
      // --------------------------------------------------------
      const col = {
        nombre: findColumn(headers, [
          "NOMBRE",
          "PRODUCTO",
        ]),

        marca: findColumn(headers, [
          "MARCA",
          "MARCA / PROVEEDOR",
          "PROVEEDOR",
        ]),

        codigo: findColumn(headers, [
          "CÓDIGO DE BARRA",
          "CODIGO DE BARRA",
          "COODIGO DE BARRA",
          "CÓDIGO BARRAS",
          "CODIGO BARRAS",
          "CODIGO_BARRAS",
        ]),

        precio: findColumn(headers, [
          "PRECIO VENTA",
          "PRECIO",
          "PRECIO DE VENTA",
        ]),

        costo: findColumn(headers, [
          "COSTO DEL PRODUCTO",
          "COSTO",
          "COSTO PRODUCTO",
        ]),

        stock: findColumn(headers, [
          "STOCK ACTUAL",
          "STOCK",
        ]),

        minimo: findColumn(headers, [
          "STOCK MÍNIMO",
          "STOCK MINIMO",
          "STOCK_MINIMO",
        ]),

        categoria: findColumn(headers, [
          "CATEGORÍA",
          "CATEGORIA",
        ]),
      };

      if (!col.nombre || !col.precio || !col.categoria) {
        throw new Error(
          "Faltan columnas obligatorias: NOMBRE, PRECIO VENTA y CATEGORIA."
        );
      }

      // --------------------------------------------------------
      // CONVERTIR FILAS
      // --------------------------------------------------------
      const records = rows
        .slice(headerIndex + 1)
        .map((row) => ({
          nombre: cleanText(
            row[headers.indexOf(col.nombre)]
          ),

          marca: cleanText(
            row[headers.indexOf(col.marca)]
          ),

          codigo: cleanText(
            row[headers.indexOf(col.codigo)]
          ),

          precio: num(
            row[headers.indexOf(col.precio)]
          ),

          costo: num(
            row[headers.indexOf(col.costo)]
          ),

          stock: Math.max(
            0,
            Math.trunc(
              num(row[headers.indexOf(col.stock)])
            )
          ),

          minimo: Math.max(
            0,
            Math.trunc(
              num(
                row[headers.indexOf(col.minimo)],
                3
              )
            )
          ),

          categoria: cleanText(
            row[headers.indexOf(col.categoria)]
          ),
        }))
        .filter((record) => record.nombre);

      // --------------------------------------------------------
      // ELIMINAR DUPLICADOS
      // --------------------------------------------------------
      const unique = [];
      const seen = new Set();

      for (const record of records) {
        const key =
          record.codigo ||
          `name:${record.nombre.toUpperCase()}`;

        if (!seen.has(key)) {
          seen.add(key);
          unique.push(record);
        }
      }

      // --------------------------------------------------------
      // CREAR CATEGORÍAS
      // --------------------------------------------------------
      const categoryNames = [
        ...new Set(
          unique
            .map((record) => record.categoria)
            .filter(Boolean)
        ),
      ];

      if (categoryNames.length) {
        const { error: catError } =
          await supabase
            .from("categorias")
            .insert(
              categoryNames.map((nombre) => ({
                nombre,
              }))
            )
            .select();

        if (
          catError &&
          !catError.message
            .toLowerCase()
            .includes("duplicate")
        ) {
          throw catError;
        }
      }

      // --------------------------------------------------------
      // OBTENER CATEGORÍAS
      // --------------------------------------------------------
      const {
        data: cats,
        error: catsError,
      } = await supabase
        .from("categorias")
        .select("id,nombre");

      if (catsError) {
        throw catsError;
      }

      const catMap = Object.fromEntries(
        (cats || []).map((category) => [
          normHeader(category.nombre),
          category.id,
        ])
      );

      // --------------------------------------------------------
      // PREPARAR PRODUCTOS
      // --------------------------------------------------------
      const payload = unique.map((record) => ({
        nombre: record.nombre,
        marca: record.marca,

        categoria_id:
          catMap[normHeader(record.categoria)] ||
          null,

        precio: record.precio,
        costo: record.costo,
        stock: record.stock,

        codigo_barras:
          record.codigo || null,

        stock_minimo: record.minimo,
        activo: true,
      }));

      const withCode = payload.filter(
        (product) => product.codigo_barras
      );

      const withoutCode = payload.filter(
        (product) => !product.codigo_barras
      );

      let addedOrUpdated = 0;

      // --------------------------------------------------------
      // PRODUCTOS CON CÓDIGO
      // --------------------------------------------------------
      if (withCode.length) {
        const { error } = await supabase
          .from("productos")
          .upsert(withCode, {
            onConflict: "codigo_barras",
          });

        if (error) {
          throw error;
        }

        addedOrUpdated += withCode.length;
      }

      // --------------------------------------------------------
      // PRODUCTOS SIN CÓDIGO
      // --------------------------------------------------------
      if (withoutCode.length) {
        const { error } = await supabase
          .from("productos")
          .insert(withoutCode);

        if (error) {
          throw error;
        }

        addedOrUpdated += withoutCode.length;
      }

      setImportResult({
        ok: true,
        total: addedOrUpdated,
        file: file.name,
      });

      await cargar();
    } catch (error) {
      console.error(error);

      setImportResult({
        ok: false,
        error:
          error.message ||
          "No se pudo importar el archivo.",
      });
    } finally {
      setImporting(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  // ==========================================================
  // RENDER
  // ==========================================================
  return (
    <div
      style={{
        fontFamily: fonts.body,
        background: colors.bg,
        minHeight: "100vh",
        display: "flex",
        color: colors.text,
      }}
    >
      <style>{FONT_IMPORT}</style>

      <Sidebar />

      <main
        style={{
          flex: 1,
          padding: "32px 40px",
          maxWidth: 1200,
        }}
      >
        {/* ====================================================
            ENCABEZADO
        ==================================================== */}
        <div
          data-mobile-stack="true"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: fonts.display,
                fontSize: 26,
                fontWeight: 600,
                margin: 0,
                color: colors.plum,
              }}
            >
              Inventario
            </p>

            <p
              style={{
                fontSize: 13.5,
                color: colors.textSoft,
                margin: "4px 0 0",
              }}
            >
              {products.length} productos registrados
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* IMPORTAR EXCEL */}
            <button
              onClick={() =>
                fileRef.current?.click()
              }
              disabled={importing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: colors.card,
                color: colors.plum,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                opacity: importing ? 0.7 : 1,
              }}
            >
              <i className="ti ti-file-spreadsheet" />

              {importing
                ? "Importando..."
                : "Importar Excel"}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) =>
                importarExcel(
                  event.target.files?.[0]
                )
              }
              style={{ display: "none" }}
            />

            {/* NUEVO PRODUCTO */}
            <button
              onClick={() => {
                setForm(emptyForm);
                setShowForm(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: colors.plum,
                color: colors.bg,
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <i className="ti ti-plus" />
              Nuevo producto
            </button>
          </div>
        </div>

        {/* ====================================================
            RESULTADO DE IMPORTACIÓN
        ==================================================== */}
        {importResult && (
          <div
            style={{
              background: importResult.ok
                ? colors.sageBg
                : colors.redBg,

              color: importResult.ok
                ? colors.sageText
                : colors.red,

              borderRadius: 9,
              padding: "11px 14px",
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            {importResult.ok
              ? `Excel importado correctamente: ${importResult.total} filas procesadas (${importResult.file}).`
              : `No se pudo importar: ${importResult.error}`}
          </div>
        )}

        {/* ====================================================
            BUSCADOR Y FILTROS
        ==================================================== */}
        <div
          data-mobile-stack="true"
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* BUSCADOR */}
          <div
            style={{
              position: "relative",
              flex: 1,
              maxWidth: 360,
              minWidth: 220,
            }}
          >
            <i
              className="ti ti-search"
              style={{
                position: "absolute",
                left: 12,
                top: 11,
                fontSize: 16,
                color: colors.textFaint,
              }}
            />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buscar por nombre, marca o código"
              style={{
                width: "100%",
                padding: "9px 12px 9px 36px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.card,
                fontSize: 13.5,
                fontFamily: fonts.body,
                outline: "none",
              }}
            />
          </div>

          {/* CATEGORÍAS */}
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {[
              "Todas",
              ...categorias.map(
                (category) => category.nombre
              ),
            ].map((category) => (
              <button
                key={category}
                onClick={() =>
                  setCatFiltro(category)
                }
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1px solid ${colors.border}`,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",

                  background:
                    catFiltro === category
                      ? colors.plum
                      : colors.card,

                  color:
                    catFiltro === category
                      ? colors.bg
                      : colors.textMuted,
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* ====================================================
            TABLA
        ==================================================== */}
        <div
          data-scroll-table="true"
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13.5,
              minWidth: 850,
            }}
          >
            {/* ------------------------------------------------
                ENCABEZADO
            ------------------------------------------------ */}
            <thead>
              <tr
                style={{
                  background: colors.bg,
                }}
              >
                {[
                  "Producto",
                  "Marca",
                  "Categoría",
                  "Costo",
                  "Precio",
                  "Margen",
                  "Stock",
                  "",
                ].map((header, index) => (
                  <th
                    key={index}
                    style={{
                      textAlign:
                        index >= 3
                          ? "right"
                          : "left",

                      padding: "12px 16px",
                      fontSize: 11.5,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: colors.textSoft,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ------------------------------------------------
                CUERPO
            ------------------------------------------------ */}
            <tbody>
              {/* CARGANDO */}
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: 28,
                      textAlign: "center",
                      color: colors.textFaint,
                    }}
                  >
                    Cargando productos...
                  </td>
                </tr>
              )}

              {/* PRODUCTOS */}
              {!loading &&
                filtered.map((product, index) => {
                  const costo = Number(
                    product.costo ?? 0
                  );

                  const precio = Number(
                    product.precio ?? 0
                  );

                  const margen = precio - costo;

                  return (
                    <tr
                      key={product.id}
                      style={{
                        borderTop:
                          index === 0
                            ? "none"
                            : `1px solid ${colors.borderLight}`,
                      }}
                    >
                      {/* 1. PRODUCTO */}
                      <td
                        style={{
                          padding: "12px 16px",
                          fontWeight: 500,
                        }}
                      >
                        {product.nombre}
                      </td>

                      {/* 2. MARCA */}
                      <td
                        style={{
                          padding: "12px 16px",
                          color: colors.textMuted,
                        }}
                      >
                        {product.marca || "—"}
                      </td>

                      {/* 3. CATEGORÍA */}
                      <td
                        style={{
                          padding: "12px 16px",
                          color: colors.textMuted,
                        }}
                      >
                        {product.categorias?.nombre ||
                          "—"}
                      </td>

                      {/* 4. COSTO */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: colors.textMuted,
                          whiteSpace: "nowrap",
                        }}
                      >
                        S/ {costo.toFixed(2)}
                      </td>

                      {/* 5. PRECIO */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        S/ {precio.toFixed(2)}
                      </td>

                      {/* 6. MARGEN */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {costo > 0 ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: colors.sageText,
                              background:
                                colors.sageBg,
                              padding: "3px 10px",
                              borderRadius: 12,
                              display:
                                "inline-flex",
                              alignItems:
                                "center",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            +S/ {margen.toFixed(2)}
                          </span>
                        ) : (
                          <span
                            style={{
                              color:
                                colors.textFaint,
                              fontSize: 12,
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>

                      {/* 7. STOCK */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                        }}
                      >
                        <StockBadge
                          stock={
                            Number(
                              product.stock ?? 0
                            )
                          }
                          minimo={
                            Number(
                              product.stock_minimo ??
                                3
                            )
                          }
                        />
                      </td>

                      {/* 8. ACCIONES */}
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <i
                          onClick={() =>
                            abrirEditar(product)
                          }
                          className="ti ti-edit"
                          title="Editar"
                          style={{
                            fontSize: 16,
                            color:
                              colors.textFaint,
                            cursor: "pointer",
                            marginRight: 10,
                          }}
                        />

                        <i
                          onClick={() =>
                            eliminar(product.id)
                          }
                          className="ti ti-trash"
                          title="Eliminar"
                          style={{
                            fontSize: 16,
                            color:
                              colors.textFaint,
                            cursor: "pointer",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}

              {/* SIN RESULTADOS */}
              {!loading &&
                filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: 28,
                        textAlign: "center",
                        color: colors.textFaint,
                      }}
                    >
                      No se encontraron productos.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ======================================================
          MODAL NUEVO / EDITAR PRODUCTO
      ====================================================== */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(61,36,54,.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 14,
          }}
        >
          <form
            onSubmit={guardar}
            style={{
              background: colors.card,
              borderRadius: 12,
              padding: "26px 28px",
              width: "min(380px,100%)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* TÍTULO */}
            <p
              style={{
                fontFamily: fonts.display,
                fontSize: 18,
                fontWeight: 600,
                margin: "0 0 18px",
                color: colors.plum,
              }}
            >
              {form.id
                ? "Editar producto"
                : "Nuevo producto"}
            </p>

            {/* CAMPOS */}
            {[
              {
                key: "nombre",
                label: "Nombre",
                type: "text",
                required: true,
              },
              {
                key: "marca",
                label: "Marca / Proveedor",
                type: "text",
              },
              {
                key: "codigo_barras",
                label: "Código de barras",
                type: "text",
              },
              {
                key: "precio",
                label: "Precio de venta (S/)",
                type: "number",
              },
              {
                key: "costo",
                label: "Costo del producto (S/)",
                type: "number",
              },
              {
                key: "stock",
                label: "Stock actual",
                type: "number",
              },
              {
                key: "stock_minimo",
                label: "Stock mínimo (alerta)",
                type: "number",
              },
            ].map((field) => (
              <div
                key={field.key}
                style={{
                  marginBottom: 12,
                }}
              >
                <label
                  style={{
                    fontSize: 11.5,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: colors.textSoft,
                    fontWeight: 600,
                  }}
                >
                  {field.label}
                </label>

                <input
                  type={field.type}
                  required={field.required}
                  value={form[field.key]}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      [field.key]:
                        event.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    background: colors.bg,
                    fontSize: 13.5,
                    fontFamily: fonts.body,
                    outline: "none",
                    marginTop: 6,
                  }}
                />
              </div>
            ))}

            {/* CATEGORÍA */}
            <div
              style={{
                marginBottom: 18,
              }}
            >
              <label
                style={{
                  fontSize: 11.5,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: colors.textSoft,
                  fontWeight: 600,
                }}
              >
                Categoría
              </label>

              <select
                value={form.categoria_id}
                onChange={(event) =>
                  setForm({
                    ...form,
                    categoria_id:
                      event.target.value,
                  })
                }
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: colors.bg,
                  fontSize: 13.5,
                  fontFamily: fonts.body,
                  outline: "none",
                  marginTop: 6,
                }}
              >
                <option value="">
                  Sin categoría
                </option>

                {categorias.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* BOTONES */}
            <div
              style={{
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setShowForm(false)
                }
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: colors.card,
                  color: colors.textMuted,
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 8,
                  border: "none",
                  background: colors.rose,
                  color: colors.plum,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? "Guardando..."
                  : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
