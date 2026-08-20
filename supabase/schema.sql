-- ============================================================
-- Osadian POS — Esquema completo de base de datos
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================================

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('admin', 'ventas')),
  created_at timestamptz default now()
);

-- Crear automáticamente un perfil base cuando se registra un usuario en Supabase Auth.
-- La cuenta nace como "ventas"; solo un administrador puede elevarla a "admin".
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    'ventas'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_perfil on auth.users;
create trigger on_auth_user_created_perfil
after insert on auth.users
for each row execute function public.crear_perfil_nuevo_usuario();

create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

create table if not exists categorias (
  id bigint generated always as identity primary key,
  nombre text not null unique
);

insert into categorias (nombre) values
  ('Accesorios'), ('Perfumería'), ('Calzado'), ('Ropa'), ('Maquillaje')
on conflict (nombre) do nothing;

create table if not exists productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  marca text default '',
  categoria_id bigint references categorias(id),
  precio numeric(10,2) not null default 0,
  costo numeric(10,2) not null default 0,
  stock integer not null default 0,
  codigo_barras text unique,
  stock_minimo integer not null default 3,
  activo boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_productos_codigo on productos(codigo_barras);

create table if not exists ventas (
  id bigint generated always as identity primary key,
  fecha timestamptz default now(),
  total numeric(10,2) not null default 0,
  metodo_pago text not null check (metodo_pago in ('Efectivo', 'Tarjeta', 'Yape')),
  usuario_id uuid references perfiles(id),
  anulada boolean not null default false
);

create table if not exists venta_items (
  id bigint generated always as identity primary key,
  venta_id bigint references ventas(id) on delete cascade,
  producto_id bigint references productos(id),
  nombre_producto text not null,
  cantidad integer not null default 1,
  precio_unitario numeric(10,2) not null,
  costo_unitario numeric(10,2) not null default 0
);

create table if not exists caja_movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz default now(),
  tipo text not null check (tipo in ('Apertura', 'Ingreso', 'Egreso')),
  detalle text not null,
  monto numeric(10,2) not null,
  usuario_id uuid references perfiles(id),
  venta_id bigint references ventas(id)
);

-- Función principal que registra la venta, descuenta stock y crea ingreso en caja
create or replace function registrar_venta(
  p_items jsonb,
  p_metodo_pago text,
  p_usuario_id uuid
)
returns bigint
language plpgsql
security definer
as $$
declare
  v_venta_id bigint;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_costo numeric(10,2);
begin
  if auth.uid() is null or p_usuario_id is null or p_usuario_id <> auth.uid() then
    raise exception 'El usuario de la venta no coincide con la sesión actual';
  end if;

  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0)
  into v_total from jsonb_array_elements(p_items) i;

  insert into ventas (total, metodo_pago, usuario_id)
  values (v_total, p_metodo_pago, p_usuario_id)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select costo into v_costo from productos where id = (v_item->>'producto_id')::bigint;

    insert into venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario)
    values (v_venta_id, (v_item->>'producto_id')::bigint, v_item->>'nombre_producto', (v_item->>'cantidad')::int, (v_item->>'precio_unitario')::numeric, coalesce(v_costo, 0));

    update productos set stock = greatest(stock - (v_item->>'cantidad')::int, 0)
    where id = (v_item->>'producto_id')::bigint;
  end loop;

  insert into caja_movimientos (tipo, detalle, monto, usuario_id, venta_id)
  values ('Ingreso', 'Venta #' || v_venta_id || ' — ' || p_metodo_pago, v_total, p_usuario_id, v_venta_id);

  return v_venta_id;
end;
$$;

-- Seguridad: solo usuarios autenticados
alter table perfiles enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table ventas enable row level security;
alter table venta_items enable row level security;
alter table caja_movimientos enable row level security;

drop policy if exists "auth_perfiles" on perfiles;
create policy "auth_perfiles" on perfiles for select using (auth.role() = 'authenticated');

drop policy if exists "admin_insert_perfiles" on perfiles;
create policy "admin_insert_perfiles" on perfiles
for insert to authenticated
with check (public.es_admin());

drop policy if exists "admin_update_perfiles" on perfiles;
create policy "admin_update_perfiles" on perfiles
for update to authenticated
using (public.es_admin())
with check (public.es_admin());
create policy "auth_categorias" on categorias for all using (auth.role() = 'authenticated');
create policy "auth_productos" on productos for all using (auth.role() = 'authenticated');
create policy "auth_ventas" on ventas for all using (auth.role() = 'authenticated');
create policy "auth_venta_items" on venta_items for all using (auth.role() = 'authenticated');
create policy "auth_caja" on caja_movimientos for all using (auth.role() = 'authenticated');


-- Modificar la fecha de una venta y mantener sincronizado el movimiento de caja.
create or replace function modificar_fecha_venta(
  p_venta_id bigint,
  p_nueva_fecha timestamptz
)
returns void
language plpgsql
security definer
as $$
declare
  v_es_admin boolean;
begin
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'admin'
  ) into v_es_admin;

  if not v_es_admin then
    raise exception 'Solo un administrador puede modificar la fecha de una venta';
  end if;

  update ventas
  set fecha = p_nueva_fecha
  where id = p_venta_id and anulada = false;

  update caja_movimientos
  set fecha = p_nueva_fecha
  where venta_id = p_venta_id;
end;
$$;


-- Eliminar una venta desde la web. Solo administradores.
-- Devuelve el stock y elimina el movimiento de caja asociado.
create or replace function eliminar_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_admin boolean;
  v_existe boolean;
begin
  select public.es_admin() into v_es_admin;

  if not v_es_admin then
    raise exception 'Solo un administrador puede eliminar ventas';
  end if;

  select exists(select 1 from ventas where id = p_venta_id and anulada = false)
  into v_existe;

  if not v_existe then
    raise exception 'La venta no existe o ya fue anulada';
  end if;

  update productos p
  set stock = p.stock + x.cantidad
  from (
    select producto_id, sum(cantidad)::integer as cantidad
    from venta_items
    where venta_id = p_venta_id and producto_id is not null
    group by producto_id
  ) x
  where p.id = x.producto_id;

  delete from caja_movimientos
  where venta_id = p_venta_id;

  delete from ventas
  where id = p_venta_id;
end;
$$;
