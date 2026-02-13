# Inventario Fase 2 - Reconocimiento Visual (Diseno)

## Estado actual (PR4 Beta)
- Ya existe fallback beta en `/inventario/escanear` detras de flag.
- Flag: `NEXT_PUBLIC_INVENTORY_VISUAL_MATCH_BETA=true` (o `1`).
- Si una foto no contiene barcode/QR legible, el cliente calcula similitud visual por histograma RGB y sugiere Top 3.
- Nunca registra movimientos automaticamente: requiere confirmacion manual del usuario.
- Rate limit basico por usuario: maximo 12 solicitudes por minuto (tabla `inventory_visual_search_log` con fallback en memoria).
- Alcance beta: usa productos activos con imagen y esta optimizado para rapidez, no para precision de ML.

## Objetivo
Permitir identificar productos por foto cuando no hay barcode/QR legible.

## Alcance funcional
1. Usuario toma foto del producto.
2. Backend calcula embedding visual.
3. Se buscan candidatos similares (Top 3) en `products`.
4. Usuario confirma el producto correcto.
5. Se registra movimiento de stock como en PR2.

## Arquitectura propuesta

### 1) Almacenamiento
- Mantener imagenes en Storage (`inventory-products`) como hoy.
- No guardar blobs en Postgres.

### 2) Base de datos
Agregar `pgvector` y tabla de embeddings:

```sql
create extension if not exists vector;

create table if not exists public.product_embeddings (
  product_id uuid primary key references public.products(id) on delete cascade,
  model text not null,
  embedding vector(1024) not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_embeddings_cosine
on public.product_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
```

### 3) Pipeline
- **Alta/edicion de producto**: despues de subir imagen full, encolar job para generar embedding.
- **Escaneo por foto**:
  - subir foto temporal,
  - generar embedding,
  - query KNN en `product_embeddings`,
  - devolver Top 3 con score.

### 4) Inferencia
- Opcion recomendada: Edge Function de Supabase para generar embedding.
- Mantener version de modelo en columna `model` para trazabilidad.

## API/acciones sugeridas
- `POST /api/inventory/visual-search`
  - input: imagen
  - output: `[{ product_id, name, score, thumb_url }]`
- `POST /api/inventory/rebuild-embedding`
  - input: `product_id`
  - uso admin para regenerar.

## UX sugerida
1. En `/inventario/escanear`, boton: `Buscar por foto (Beta)`.
2. Mostrar candidatos con score y etiqueta:
   - Alto (>0.90), Medio (0.75-0.90), Bajo (<0.75).
3. Si score bajo, forzar confirmacion manual por texto.

## Seguridad y costos
- Llamadas de embedding solo para usuarios autenticados.
- Rate limit por usuario para evitar abuso.
- Mantener fotos temporales con TTL corto si se suben para busqueda.

## Criterios de aceptacion Fase 2
- Dada una foto valida, devuelve Top 3 candidatos.
- Usuario confirma uno y registra ingreso sin editar mas de cantidad.
- Falsos positivos no ejecutan movimientos automaticos sin confirmacion.
