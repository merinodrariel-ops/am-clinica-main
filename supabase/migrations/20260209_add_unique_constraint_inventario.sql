ALTER TABLE inventario_items
ADD CONSTRAINT inventario_items_nombre_area_key UNIQUE (nombre, area);
