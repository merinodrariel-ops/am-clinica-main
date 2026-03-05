-- Agrega prestaciones de Laboratorio al catalogo

INSERT INTO public.prestaciones_lista (area_nombre, nombre, precio_base, moneda, terminos, activo)
SELECT 'Laboratorio', 'Encerado Diagnostico x pieza', 3500.00, 'ARS', NULL, true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.prestaciones_lista
    WHERE lower(area_nombre) = lower('Laboratorio')
      AND lower(nombre) = lower('Encerado Diagnostico x pieza')
);

INSERT INTO public.prestaciones_lista (area_nombre, nombre, precio_base, moneda, terminos, activo)
SELECT 'Laboratorio', 'Diseno definitivo x pieza', 6000.00, 'ARS', NULL, true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.prestaciones_lista
    WHERE lower(area_nombre) = lower('Laboratorio')
      AND lower(nombre) = lower('Diseno definitivo x pieza')
);
