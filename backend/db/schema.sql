CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS orders (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     VARCHAR(12)  UNIQUE NOT NULL,
  status           VARCHAR(30)  NOT NULL DEFAULT 'pending_payment',
  CONSTRAINT orders_status_check CHECK (
    status IN (
      'pending_payment',
      'paid',
      'preparing',
      'shipped',
      'delivered',
      'cancelled',
      'payment_failed'
    )
  ),
  customer_name    VARCHAR(120) NOT NULL,
  customer_email   VARCHAR(200) NOT NULL,
  customer_phone   VARCHAR(40)  NOT NULL,
  delivery_type    VARCHAR(20)  NOT NULL CHECK (delivery_type IN ('pickup', 'delivery')),
  address          VARCHAR(255),
  city             VARCHAR(100),
  postal_code      VARCHAR(20),
  total_amount     NUMERIC(12,2) NOT NULL,
  mp_preference_id VARCHAR(255),
  mp_payment_id    VARCHAR(255),
  mp_status        VARCHAR(50),
  items            JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON orders(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email_lower ON orders(LOWER(customer_email));
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at DESC) WHERE paid_at IS NOT NULL;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Cuentas de cliente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(200) UNIQUE NOT NULL,
  password_hash  VARCHAR(200) NOT NULL,
  first_name     VARCHAR(120) NOT NULL,
  last_name      VARCHAR(120) NOT NULL,
  phone          VARCHAR(40),
  address        VARCHAR(255),
  city           VARCHAR(100),
  postal_code    VARCHAR(20),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_active
  ON email_verification_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(200) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Favoritos. product_id referencia products.id (ver cutover de tipo + FK más
-- abajo, después de que la tabla products exista) — declarado INTEGER acá
-- solo para que la creación inicial en una base nueva funcione; el bloque de
-- cutover al final del archivo lo deja en UUID con FK real.
CREATE TABLE IF NOT EXISTS favorites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- Avisos de "notificame cuando haya stock". Invitados permitidos (user_id
-- nullable) — no vale la pena forzar una cuenta solo para pedir un aviso.
CREATE TABLE IF NOT EXISTS stock_alerts (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
  product_id INTEGER      NOT NULL,
  email      VARCHAR(200) NOT NULL,
  notified   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_product_id ON stock_alerts(product_id);

-- Vínculo opcional de un pedido con la cuenta que lo hizo (nullable: el
-- checkout como invitado sigue funcionando igual).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Reseñas de producto. product_id referencia products.id, igual que favorites
-- (ver cutover de tipo + FK al final del archivo). Una reseña por usuario y
-- producto: reeditar vuelve a publicar la misma fila.
CREATE TABLE IF NOT EXISTS reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER     NOT NULL,
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Inventario interno (catálogo Huergui + precios Alcides + ventas POS + compras
-- KIAN). Esta misma tabla es también el catálogo público: un producto se
-- "publica" completando las columnas de abajo (name, category, image_url, etc.)
-- y poniendo published = true — ver GET /api/catalog (routes/catalog.js).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            VARCHAR(64)   NOT NULL,
  descripcion       TEXT,
  grupo             VARCHAR(150),        -- marca/fabricante (Huergui col C)
  subgrupo          VARCHAR(150),        -- distribuidor/categoría (Huergui col D)
  medida            VARCHAR(60),
  watts             NUMERIC(10,2),
  amperes           NUMERIC(10,3),
  precio_costo      NUMERIC(14,2),
  precio_venta      NUMERIC(14,2),
  precio_iva        NUMERIC(14,2),
  precio_costo_usd  NUMERIC(14,2),       -- de compras KIAN (col L, precio final USD)
  price_currency    VARCHAR(3)     NOT NULL DEFAULT 'ARS'
                    CHECK (price_currency IN ('ARS','USD')),
  price_exchange_rate NUMERIC(14,4),
  stock             INTEGER       NOT NULL DEFAULT 0,
  source            VARCHAR(20)   NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('catalog','price_list','sale','purchase','manual')),
  supplier          VARCHAR(80)   NOT NULL DEFAULT 'OTRO',
  price_updated_at TIMESTAMPTZ,
  stock_updated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT products_codigo_key UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_products_supplier    ON products(supplier);
CREATE INDEX IF NOT EXISTS idx_products_stock       ON products(stock);
CREATE INDEX IF NOT EXISTS idx_products_grupo       ON products(grupo);

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo público — reusa la misma tabla `products` (Inventario) en vez de un
-- catálogo separado. Un producto de inventario se "publica" completando estas
-- columnas y poniendo published = true; deja de existir la duplicación entre
-- el Inventario interno y el catálogo que ve el cliente.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS name              VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category          VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory       VARCHAR(150);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_larga TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price    NUMERIC(14,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hover_image_url   TEXT;
-- Fotos adicionales para la galería del detalle de producto, en el orden en
-- que se muestran (no reemplaza a image_url, que sigue siendo la portada).
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_images    JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_options      JSONB NOT NULL DEFAULT '[]';
-- Tono de luz (ej: cálido/neutro/frío), típico de focos y reflectores.
-- Misma forma que color_options (name/hex/price...) pero es un eje aparte:
-- un producto puede tener color de carcasa y tono de luz al mismo tiempo. La
-- celda de variant_stock combina color+tono en una sola clave de fila (ver
-- resolveVariantStockPath en backend/routes/orders.js).
ALTER TABLE products ADD COLUMN IF NOT EXISTS tone_options      JSONB NOT NULL DEFAULT '[]';
-- Stock por combinación exacta color×medida, opcional. Forma:
-- { "<nombre color o '_'>": { "<medida o '_'>": <stock entero> } }.
-- Vacío ('{}') = el producto no usa esto y sigue usando el `stock` de arriba
-- tal cual siempre funcionó; cuando se carga, `stock` pasa a ser la suma de
-- todas las celdas (ver POST/PATCH /api/products y reserveStock).
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_stock     JSONB NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_temp        NUMERIC(6,0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS amperes           NUMERIC(10,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ip_rating         VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS material          VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cable_type        VARCHAR(60);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type      VARCHAR(150);
ALTER TABLE products ADD COLUMN IF NOT EXISTS published         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency    VARCHAR(3) NOT NULL DEFAULT 'ARS';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_exchange_rate NUMERIC(14,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS precio_venta_usd   NUMERIC(14,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS precio_iva_usd     NUMERIC(14,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price_usd NUMERIC(14,2);
-- Datos físicos listos para cotizadores de envío. Dimensiones en centímetros
-- y peso en kilogramos para evitar conversiones ambiguas al integrar una API.
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm          NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm           NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm          NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg          NUMERIC(10,3);
-- Etiquetas manuales para la tarjeta de producto de la tienda ("Nuevo" / "Más
-- vendido"). Se activan a mano desde el admin, no se calculan de ventas.
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new             BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS best_seller        BOOLEAN NOT NULL DEFAULT FALSE;
-- Producto "a pedido": no tiene stock inmediato, se fabrica/importa al confirmar
-- la compra. Se activa a mano desde el admin y alimenta la sección pública
-- "Productos a pedido".
ALTER TABLE products ADD COLUMN IF NOT EXISTS a_pedido           BOOLEAN NOT NULL DEFAULT FALSE;
-- Nullable a propósito: NULL significa "usar el default global de la tienda"
-- (store_settings.dias_entrega_pedido_default), así el admin solo completa este
-- campo producto por producto en los casos excepcionales que se apartan del plazo
-- general.
ALTER TABLE products ADD COLUMN IF NOT EXISTS dias_entrega_pedido INTEGER;

-- Asociaciones confirmadas entre el código que usa cada proveedor en su XLS y
-- el producto real del catálogo. Se consultan antes de cualquier heurística de
-- similitud, por lo que una relación solo necesita revisarse una vez.
CREATE TABLE IF NOT EXISTS supplier_product_mappings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier         VARCHAR(80)  NOT NULL,
  source_code      VARCHAR(200) NOT NULL,
  source_code_key  VARCHAR(200) NOT NULL,
  product_id       UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name       VARCHAR(100),
  color_hex        VARCHAR(7),
  size_label       VARCHAR(100),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (supplier, source_code_key)
);

ALTER TABLE supplier_product_mappings
  ADD COLUMN IF NOT EXISTS size_label VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_supplier_product_mappings_product
  ON supplier_product_mappings(product_id);

DROP TRIGGER IF EXISTS supplier_product_mappings_updated_at ON supplier_product_mappings;
CREATE TRIGGER supplier_product_mappings_updated_at
  BEFORE UPDATE ON supplier_product_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reglas normalizadas para productos agrupados. Un atributo NULL significa
-- "cualquiera". Precio y stock se resuelven por separado tomando la regla
-- coincidente con mayor cantidad de atributos específicos.
CREATE TABLE IF NOT EXISTS product_variant_rules (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name         VARCHAR(100),
  color_hex          VARCHAR(7),
  size_label         VARCHAR(100),
  tone_name          VARCHAR(100),
  image_url          TEXT,
  product_data       JSONB         NOT NULL DEFAULT '{}',
  precio_costo       NUMERIC(14,2),
  precio_venta       NUMERIC(14,2),
  precio_iva         NUMERIC(14,2),
  precio_costo_usd   NUMERIC(14,2),
  precio_venta_usd   NUMERIC(14,2),
  precio_iva_usd     NUMERIC(14,2),
  price_currency     VARCHAR(3)     NOT NULL DEFAULT 'ARS'
                     CHECK (price_currency IN ('ARS','USD')),
  price_exchange_rate NUMERIC(14,4),
  stock              INTEGER       CHECK (stock IS NULL OR stock >= 0),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE product_variant_rules ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE product_variant_rules ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);
ALTER TABLE product_variant_rules ADD COLUMN IF NOT EXISTS product_data JSONB NOT NULL DEFAULT '{}';
-- Color representativo del tono de esta variante (ej: tostado para "Cálido").
-- Sin esta columna no había forma de que el admin eligiera el color al unir
-- productos o editar variantes ya agrupadas, y el tono quedaba siempre gris.
ALTER TABLE product_variant_rules ADD COLUMN IF NOT EXISTS tone_hex VARCHAR(7);

CREATE INDEX IF NOT EXISTS idx_product_variant_rules_product
  ON product_variant_rules(product_id);

DROP TRIGGER IF EXISTS product_variant_rules_updated_at ON product_variant_rules;
CREATE TRIGGER product_variant_rules_updated_at
  BEFORE UPDATE ON product_variant_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- `supplier` inicialmente se infería del código con una columna generada. Se
-- conserva el valor ya calculado, pero pasa a ser editable desde el producto.
-- El trigger enumera `supplier` en UPDATE OF, por lo que PostgreSQL exige
-- quitarlo antes de cambiar el tipo de la columna. Se recrea más abajo.
DROP TRIGGER IF EXISTS products_sync_single_base_variant ON products;
ALTER TABLE products ALTER COLUMN supplier DROP EXPRESSION IF EXISTS;
ALTER TABLE products ALTER COLUMN supplier TYPE VARCHAR(80);
ALTER TABLE products ALTER COLUMN supplier SET DEFAULT 'OTRO';
UPDATE products SET supplier = 'OTRO' WHERE supplier IS NULL OR BTRIM(supplier) = '';
ALTER TABLE products ALTER COLUMN supplier SET NOT NULL;

-- Los importadores y ajustes rápidos históricos actualizan la fila `products`.
-- Cuando el producto tiene una sola variante (la Base), reflejamos esos cambios
-- en ella para que precio, stock y ficha técnica no queden desincronizados.
CREATE OR REPLACE FUNCTION sync_single_base_variant()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) = 1 FROM product_variant_rules WHERE product_id = NEW.id) THEN
    UPDATE product_variant_rules
       SET precio_costo = NEW.precio_costo,
           precio_venta = NEW.precio_venta,
           precio_iva = NEW.precio_iva,
           precio_costo_usd = NEW.precio_costo_usd,
           precio_venta_usd = NEW.precio_venta_usd,
           precio_iva_usd = NEW.precio_iva_usd,
           price_currency = NEW.price_currency,
           price_exchange_rate = NEW.price_exchange_rate,
           stock = NEW.stock,
           image_url = NEW.image_url,
           product_data = product_data || jsonb_build_object(
             'codigo', NEW.codigo,
             'supplier', NEW.supplier,
             'inventoryDescription', COALESCE(NEW.descripcion, ''),
             'medida', COALESCE(NEW.medida, ''),
             'watts', NEW.watts,
             'amperes', NEW.amperes,
             'colorTemp', NEW.color_temp,
             'ipRating', COALESCE(NEW.ip_rating, ''),
             'material', COALESCE(NEW.material, ''),
             'cableType', COALESCE(NEW.cable_type, ''),
             'lengthCm', NEW.length_cm,
             'widthCm', NEW.width_cm,
             'heightCm', NEW.height_cm,
             'weightKg', NEW.weight_kg,
             'hoverImage', COALESCE(NEW.hover_image_url, '')
           ),
           updated_at = NOW()
     WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_sync_single_base_variant ON products;
CREATE TRIGGER products_sync_single_base_variant
  AFTER UPDATE OF codigo, supplier, descripcion, medida, watts, amperes, color_temp,
    ip_rating, material, cable_type, length_cm, width_cm, height_cm, weight_kg,
    hover_image_url, image_url, precio_costo, precio_venta, precio_iva,
    precio_costo_usd, precio_venta_usd, precio_iva_usd, price_currency,
    price_exchange_rate, stock
  ON products
  FOR EACH ROW EXECUTE FUNCTION sync_single_base_variant();

ALTER TABLE supplier_product_mappings
  ADD COLUMN IF NOT EXISTS tone_name VARCHAR(100);
ALTER TABLE supplier_product_mappings
  ADD COLUMN IF NOT EXISTS variant_rule_id UUID REFERENCES product_variant_rules(id) ON DELETE SET NULL;

-- Configuracion administrativa compartida. La tienda sigue cobrando en ARS;
-- esta cotizacion permite ingresar y visualizar precios de proveedor en USD.
CREATE TABLE IF NOT EXISTS store_settings (
  id               SMALLINT      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usd_ars_rate     NUMERIC(14,4) NOT NULL DEFAULT 1510 CHECK (usd_ars_rate > 0),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO store_settings (id, usd_ars_rate)
VALUES (1, 1510)
ON CONFLICT (id) DO NOTHING;

-- Plazo de entrega global para productos "a pedido" (products.dias_entrega_pedido
-- NULL). Configurado una sola vez acá para que el admin no tenga que completar el
-- campo por producto salvo excepciones.
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS dias_entrega_pedido_default INTEGER NOT NULL DEFAULT 7;

-- Moneda de origen elegida para cada proveedor. Los precios públicos continúan
-- expresados en ARS; las columnas *_usd conservan los importes fuente para poder
-- recalcularlos cuando cambia la cotización sin perder precisión.
CREATE TABLE IF NOT EXISTS supplier_price_settings (
  supplier   VARCHAR(80) PRIMARY KEY,
  currency   VARCHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Excepción de moneda para un código puntual dentro de la lista de un
-- proveedor. No todos los excels respetan la moneda configurada en
-- supplier_price_settings; esta tabla recuerda el caso puntual para que se
-- siga aplicando en cada carga futura de ese proveedor, sin depender de que
-- el admin la recuerde a mano.
CREATE TABLE IF NOT EXISTS supplier_price_code_overrides (
  supplier        VARCHAR(80)  NOT NULL,
  source_code_key VARCHAR(200) NOT NULL,
  source_code     VARCHAR(200) NOT NULL,
  currency        VARCHAR(3)   NOT NULL CHECK (currency IN ('ARS', 'USD')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier, source_code_key)
);

-- `cable_type` fue el primer filtro de nivel 3. `product_type` lo generaliza
-- para todas las ramas del mismo árbol de categorías sin perder datos previos.
UPDATE products
SET product_type = cable_type
WHERE product_type IS NULL AND cable_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_published ON products(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);

-- Cutover de IDs: favorites/stock_alerts/reviews referenciaban los IDs enteros
-- del catálogo estático del frontend (src/data/products.js), sin FK real. Sin
-- tráfico de producción todavía, se corta limpio a UUID (el id real de
-- `products`) y se agregan las FK que antes no podían existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'favorites' AND column_name = 'product_id' AND data_type = 'integer'
  ) THEN
    TRUNCATE favorites, stock_alerts, reviews;
    ALTER TABLE favorites    ALTER COLUMN product_id TYPE UUID USING NULL;
    ALTER TABLE stock_alerts ALTER COLUMN product_id TYPE UUID USING NULL;
    ALTER TABLE reviews      ALTER COLUMN product_id TYPE UUID USING NULL;
    ALTER TABLE favorites    ADD CONSTRAINT favorites_product_id_fkey    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    ALTER TABLE stock_alerts ADD CONSTRAINT stock_alerts_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    ALTER TABLE reviews      ADD CONSTRAINT reviews_product_id_fkey      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reservas de retiro en local + pago en el local + estimación de envío.
-- payment_method distingue si el pedido se paga online (Mercado Pago) o se
-- reserva para pagar en el local al retirar. pickup_date es la fecha elegida
-- para retirar (solo pickup). estimated_delivery_date es el tiempo máximo de
-- Correo Argentino para el CP + 3 días hábiles de margen propio (solo
-- delivery). shipping_cost persiste el valor recalculado por el backend y
-- shipping_service distingue clásico/expreso. reservation_expires_at y
-- stock_released_at sostienen
-- la reserva/liberación de stock (ver backend/services/stockReservation.js).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'mercadopago';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('mercadopago', 'pay_in_store'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(20);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shipping_service_check;
ALTER TABLE orders ADD CONSTRAINT orders_shipping_service_check CHECK (
  shipping_service IS NULL OR shipping_service IN ('clasico', 'expreso')
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_email_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_dni VARCHAR(8);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_extra VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS province VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_same_as_shipping BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address_extra VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_city VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_postal_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_province VARCHAR(100);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'pending_payment',
    'paid',
    'preparing',
    'shipped',
    'delivered',
    'cancelled',
    'payment_failed',
    'reserved',
    'expired'
  )
);

CREATE INDEX IF NOT EXISTS idx_orders_reservation_expires_at ON orders(reservation_expires_at)
  WHERE reservation_expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Subcategorías creadas a mano desde el admin. El árbol "de fábrica" sigue
-- viviendo en src/data/categoryTree.js (frontend, sin tocar); esta tabla solo
-- guarda las que el admin agrega, y el panel las combina con las del árbol
-- estático al mostrar las opciones de categoría/subcategoría de un producto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcategories (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  category   VARCHAR(100) NOT NULL,
  name       VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (category, name)
);

-- Tercer nivel del árbol ("tipo/clasificación" dentro de una subcategoría,
-- ej. "Unipolares" dentro de "Cables Normalizados"), agregado a mano desde el
-- admin igual que `subcategories`.
CREATE TABLE IF NOT EXISTS product_types (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  category    VARCHAR(100) NOT NULL,
  subcategory VARCHAR(150) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (category, subcategory, name)
);

-- Cambios hechos desde el administrador sobre los nodos que vienen incluidos
-- en el arbol de categorias del frontend. La clave conserva la ruta original,
-- de modo que un nodo pueda renombrarse varias veces, ocultarse y restaurarse.
CREATE TABLE IF NOT EXISTS category_tree_customizations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  level       VARCHAR(20)  NOT NULL CHECK (level IN ('category', 'subcategory', 'type')),
  category    VARCHAR(100) NOT NULL,
  subcategory VARCHAR(150) NOT NULL DEFAULT '',
  name        VARCHAR(150) NOT NULL DEFAULT '',
  label       VARCHAR(150),
  hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (level, category, subcategory, name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cupones de descuento (código ingresado en el checkout). El código se guarda
-- tal cual lo cargó el admin, pero la unicidad y las búsquedas son
-- case-insensitive (UPPER(code)) para no depender de cómo lo tipee el cliente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(40)   NOT NULL,
  type         VARCHAR(10)   NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value        NUMERIC(12,2) NOT NULL CHECK (value > 0),
  active       BOOLEAN       NOT NULL DEFAULT TRUE,
  min_purchase NUMERIC(12,2) CHECK (min_purchase IS NULL OR min_purchase >= 0),
  usage_limit  INTEGER       CHECK (usage_limit IS NULL OR usage_limit > 0),
  times_used   INTEGER       NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT coupons_percentage_max CHECK (type <> 'percentage' OR value <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_upper ON coupons(UPPER(code));

DROP TRIGGER IF EXISTS coupons_updated_at ON coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Cupón aplicado a un pedido, si hubo. discount_amount ya está restado de
-- total_amount — se persiste aparte para poder mostrarlo desglosado en el
-- detalle del pedido y en el panel de admin.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Los intentos nuevos cuentan el cupón recién al aprobarse el pago. El
-- backfill marca los pedidos anteriores porque la versión previa ya había
-- incrementado times_used al crearlos, incluso antes de Mercado Pago.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'orders'
      AND column_name = 'coupon_usage_counted_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_usage_counted_at TIMESTAMPTZ;
    UPDATE orders
    SET coupon_usage_counted_at = COALESCE(paid_at, created_at)
    WHERE coupon_code IS NOT NULL;
  END IF;
END $$;

-- Datos fiscales confirmados por el comprador. Permanecen nullable para que
-- los pedidos históricos puedan confirmarlos antes de solicitar comprobante.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_recipient_name VARCHAR(160);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_doc_type INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_doc_number VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_vat_condition_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_data_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_concept SMALLINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_service_from DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_service_to DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_payment_due DATE;

-- Cuando el comprador delega el retiro, el local necesita identificar a esa
-- persona sin reemplazar al titular que pagó y recibió el comprobante.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_person_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_person_last_name VARCHAR(100);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_invoice_concept_check;
ALTER TABLE orders ADD CONSTRAINT orders_invoice_concept_check CHECK (
  invoice_concept IS NULL OR invoice_concept IN (1, 2, 3)
);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_invoice_service_dates_check;
ALTER TABLE orders ADD CONSTRAINT orders_invoice_service_dates_check CHECK (
  invoice_concept IS NULL
  OR invoice_concept = 1
  OR (
    invoice_service_from IS NOT NULL
    AND invoice_service_to IS NOT NULL
    AND invoice_payment_due IS NOT NULL
    AND invoice_service_from <= invoice_service_to
  )
);

-- Comprobantes ARCA. Todos los datos que alimentan el PDF quedan congelados
-- en snapshots; nunca se reconstruyen desde el catálogo mutable.
CREATE TABLE IF NOT EXISTS invoices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
  issuer_cuit              VARCHAR(11) NOT NULL,
  pto_vta                  INTEGER NOT NULL,
  cbte_tipo                INTEGER NOT NULL,
  cbte_numero              BIGINT,
  concepto                 SMALLINT NOT NULL DEFAULT 1,
  fecha_comprobante        DATE,
  fecha_servicio_desde     DATE,
  fecha_servicio_hasta     DATE,
  fecha_vencimiento_pago   DATE,
  receiver_doc_type        INTEGER NOT NULL,
  receiver_doc_number      VARCHAR(20) NOT NULL,
  receiver_vat_condition_id INTEGER NOT NULL,
  currency                 VARCHAR(3) NOT NULL DEFAULT 'PES',
  currency_rate            NUMERIC(18,6) NOT NULL DEFAULT 1,
  imp_total                NUMERIC(12,2) NOT NULL,
  imp_neto                 NUMERIC(12,2) NOT NULL,
  imp_iva                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  imp_trib                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  imp_tot_conc             NUMERIC(12,2) NOT NULL DEFAULT 0,
  imp_op_ex                NUMERIC(12,2) NOT NULL DEFAULT 0,
  cae                      VARCHAR(20),
  cae_expiration_date      DATE,
  arca_result              VARCHAR(1),
  issuer_snapshot          JSONB NOT NULL,
  receiver_snapshot        JSONB NOT NULL,
  items_snapshot           JSONB NOT NULL,
  arca_request             JSONB,
  arca_response            JSONB,
  arca_events              JSONB NOT NULL DEFAULT '[]',
  observations             JSONB NOT NULL DEFAULT '[]',
  errors                   JSONB NOT NULL DEFAULT '[]',
  attempt_count            INTEGER NOT NULL DEFAULT 0,
  last_attempt_at          TIMESTAMPTZ,
  authorized_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_status_check CHECK (
    status IN ('pending', 'processing', 'uncertain', 'authorized', 'rejected', 'error')
  ),
  CONSTRAINT invoices_voucher_identity_check CHECK (
    pto_vta > 0 AND cbte_tipo > 0 AND (cbte_numero IS NULL OR cbte_numero > 0)
  ),
  CONSTRAINT invoices_amounts_check CHECK (
    imp_total >= 0 AND imp_neto >= 0 AND imp_iva >= 0 AND imp_trib >= 0
    AND imp_tot_conc >= 0 AND imp_op_ex >= 0
  ),
  CONSTRAINT invoices_authorized_check CHECK (
    status <> 'authorized'
    OR (cbte_numero IS NOT NULL AND cae IS NOT NULL AND cae_expiration_date IS NOT NULL)
  ),
  CONSTRAINT invoices_concept_check CHECK (concepto IN (1, 2, 3))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_fiscal_number
  ON invoices(issuer_cuit, pto_vta, cbte_tipo, cbte_numero)
  WHERE cbte_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status_created_at ON invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_authorized_at ON invoices(authorized_at DESC)
  WHERE authorized_at IS NOT NULL;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auditoría persistente del último intento de facturación. La emisión no se
-- procesa como cola: webhook, cliente, admin o script invocan el servicio
-- inmediatamente y esta fila conserva origen, cantidad y último error.
CREATE TABLE IF NOT EXISTS invoice_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  run_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at          TIMESTAMPTZ,
  last_error_code    VARCHAR(100),
  last_error_message VARCHAR(500),
  last_attempt_origin VARCHAR(30),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'needs_data', 'completed', 'failed')
  ),
  CONSTRAINT invoice_jobs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT invoice_jobs_origin_check CHECK (
    last_attempt_origin IS NULL OR last_attempt_origin IN ('webhook', 'customer', 'admin', 'manual_script')
  )
);

ALTER TABLE invoice_jobs
  ADD COLUMN IF NOT EXISTS last_attempt_origin VARCHAR(30);
ALTER TABLE invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_status_check;
UPDATE invoice_jobs SET status = 'pending' WHERE status IN ('queued', 'retry_wait');
ALTER TABLE invoice_jobs ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE invoice_jobs
  ADD CONSTRAINT invoice_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'needs_data', 'completed', 'failed')
  );
ALTER TABLE invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_attempt_count_check;
ALTER TABLE invoice_jobs
  ADD CONSTRAINT invoice_jobs_attempt_count_check CHECK (attempt_count >= 0);
ALTER TABLE invoice_jobs DROP CONSTRAINT IF EXISTS invoice_jobs_origin_check;
ALTER TABLE invoice_jobs
  ADD CONSTRAINT invoice_jobs_origin_check CHECK (
    last_attempt_origin IS NULL OR last_attempt_origin IN ('webhook', 'customer', 'admin', 'manual_script')
  );

DROP INDEX IF EXISTS idx_invoice_jobs_due;
CREATE INDEX IF NOT EXISTS idx_invoice_jobs_status_updated_at
  ON invoice_jobs(status, updated_at DESC);

DROP TRIGGER IF EXISTS invoice_jobs_updated_at ON invoice_jobs;
CREATE TRIGGER invoice_jobs_updated_at
  BEFORE UPDATE ON invoice_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Última respuesta paramétrica válida. Permite servir checkout aunque ARCA
-- tenga una interrupción temporal, sin hardcodear condiciones fiscales.
CREATE TABLE IF NOT EXISTS arca_parameter_cache (
  cache_key  VARCHAR(120) PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS arca_parameter_cache_updated_at ON arca_parameter_cache;
CREATE TRIGGER arca_parameter_cache_updated_at
  BEFORE UPDATE ON arca_parameter_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Composicion fiscal congelada al emitir (alicuota, base imponible e IVA).
-- Se agrega al final como migracion compatible para instalaciones existentes.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS iva_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Disponibilidad: reemplaza el control de stock por producto ───────────────
-- El mismo inventario físico se vende en el mostrador y online, sin POS que los
-- sincronice, así que cualquier número de stock queda viejo en días — y stock
-- equivocado es peor que no tener stock: bloquea ventas posibles o promete lo
-- que no está. Con reposición de proveedor de ~3 días, lo único que el cliente
-- necesita saber es el plazo de entrega. Esta bandera invierte el eje de
-- `a_pedido`: por defecto un producto se repone (FALSE) y el admin marca a mano
-- los que puede despachar enseguida.
--
-- `stock`, `variant_stock` y product_variant_rules.stock quedan intactos y sin
-- uso: la tienda dejó de leerlos y la reserva transaccional está apagada, pero
-- el dato sigue ahí por si más adelante se vuelve a llevar stock de un
-- subconjunto del catálogo.
--
-- El backfill corre una sola vez, dentro del mismo IF que crea la columna, para
-- que el catálogo no arranque entero como "reposición" y para no pisar después
-- las marcas que el admin haya hecho a mano.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock_inmediato'
  ) THEN
    ALTER TABLE products ADD COLUMN stock_inmediato BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE products SET stock_inmediato = TRUE WHERE stock > 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_stock_inmediato ON products(stock_inmediato);

-- Días hábiles entre la compra y el despacho cuando el producto SÍ está en el
-- local. Configurable porque depende de cómo trabaja el negocio, no del código
-- (misma regla que el umbral de envío gratis).
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS dias_despacho_inmediato INTEGER NOT NULL DEFAULT 1;

-- `dias_entrega_pedido_default` pasa a significar "días hábiles de reposición
-- del proveedor" — el plazo de todo producto sin stock inmediato. Se reusa la
-- columna en vez de crear otra para no dejar dos fuentes de verdad del mismo
-- número. `products.dias_entrega_pedido` sigue siendo el override por producto,
-- para el proveedor puntual que tarda más que el resto.

-- Extremo superior de la ventana de entrega. `estimated_delivery_date` pasa a
-- ser el extremo inferior: la tienda dejó de prometer un día exacto porque el
-- tránsito varía según la localidad dentro de cada zona de CP, y una fecha
-- inventada con esa precisión es justamente la que genera el reclamo.
-- Los pedidos anteriores tienen NULL acá y se siguen mostrando con su fecha única.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_max_date DATE;

-- Una fila por importación de lista de precios confirmada. `products.price_updated_at`
-- no responde la pregunta que se hace el admin: solo se mueve en los productos
-- cuyo precio efectivamente cambió, así que una lista que el proveedor mandó sin
-- aumentos queda invisible y al mes siguiente no hay forma de saber si se subió.
-- Acá se registra la carga aunque no haya cambiado un solo precio.
CREATE TABLE IF NOT EXISTS supplier_price_imports (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier        VARCHAR(80)  NOT NULL,
  file_names      JSONB        NOT NULL DEFAULT '[]',
  total_rows      INTEGER      NOT NULL DEFAULT 0,
  created_count   INTEGER      NOT NULL DEFAULT 0,
  updated_count   INTEGER      NOT NULL DEFAULT 0,
  unchanged_count INTEGER      NOT NULL DEFAULT 0,
  skipped_count   INTEGER      NOT NULL DEFAULT 0,
  -- Filas que quedaron esperando que se eligiera una variante: sin esto una
  -- importación incompleta figura en el historial como si hubiera terminado.
  pending_variant_count INTEGER NOT NULL DEFAULT 0,
  -- Cotización con la que se convirtieron los precios de ese proveedor si su
  -- lista venía en USD. Sin ella no se puede reconstruir de dónde salió un importe.
  exchange_rate   NUMERIC(14,4),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_price_imports_supplier
  ON supplier_price_imports(supplier, created_at DESC);

-- Precio derivado de otra variante del mismo producto. Existe para las variantes
-- que el negocio agrega a mano y el proveedor no lista: sin esto quedan con el
-- precio del día que se crearon y, después de un par de aumentos, una medida
-- grande termina más barata que una chica. `price_source_percent` es el
-- porcentaje sobre la variante seguida (0 = mismo precio, 15 = 15% más caro).
ALTER TABLE product_variant_rules
  ADD COLUMN IF NOT EXISTS price_source_rule_id UUID
  REFERENCES product_variant_rules(id) ON DELETE SET NULL;
ALTER TABLE product_variant_rules
  ADD COLUMN IF NOT EXISTS price_source_percent NUMERIC(7,2) NOT NULL DEFAULT 0;

-- Una variante no puede seguirse a sí misma. Las cadenas (A sigue a B que sigue
-- a C) se rechazan en la aplicación: obligar a que el origen tenga precio propio
-- descarta los ciclos y deja la resolución en una sola pasada.
ALTER TABLE product_variant_rules
  DROP CONSTRAINT IF EXISTS product_variant_rules_price_source_distinct;
ALTER TABLE product_variant_rules
  ADD CONSTRAINT product_variant_rules_price_source_distinct
  CHECK (price_source_rule_id IS NULL OR price_source_rule_id <> id);

CREATE INDEX IF NOT EXISTS idx_product_variant_rules_price_source
  ON product_variant_rules(price_source_rule_id)
  WHERE price_source_rule_id IS NOT NULL;

-- Transferencia bancaria manual. La configuracion vive en store_settings para
-- que el comercio pueda cambiar la cuenta sin desplegar; cada pedido conserva
-- un snapshot porque las instrucciones y el importe no deben mutar despues de
-- que el cliente confirma la compra.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 10;
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_expiry_hours INTEGER NOT NULL DEFAULT 72;
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_cbu VARCHAR(22);
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_alias VARCHAR(80);
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_account_holder VARCHAR(160);

ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_bank_transfer_discount_check;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_bank_transfer_discount_check
  CHECK (bank_transfer_discount_percent >= 0 AND bank_transfer_discount_percent < 100);
ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_bank_transfer_expiry_check;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_bank_transfer_expiry_check
  CHECK (bank_transfer_expiry_hours BETWEEN 1 AND 720);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('mercadopago', 'pay_in_store', 'bank_transfer'));

-- El descuento bancario queda separado del cupon para reconstruir el total y
-- mostrar ambas bonificaciones sin cambiar la semantica historica de
-- discount_amount.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS transfer_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Snapshot de CBU, alias, titular, porcentaje y vencimiento mostrados al crear
-- el pedido; evita que una edicion posterior cambie una instruccion ya emitida.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bank_transfer_snapshot JSONB;
-- Solo se persiste el hash del secreto que autoriza a un invitado a informar el
-- pago; conocer el UUID o el numero corto del pedido no alcanza.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_access_token_hash VARCHAR(64);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_transfer_discount_check;
ALTER TABLE orders ADD CONSTRAINT orders_transfer_discount_check
  CHECK (transfer_discount_amount >= 0);

-- Cada reenvio es inmutable y auditable. Los indices parciales impiden que dos
-- requests concurrentes dejen mas de un comprobante pendiente o aprobado.
CREATE TABLE IF NOT EXISTS bank_transfer_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  attempt_number        INTEGER NOT NULL,
  payer_account_holder  VARCHAR(160) NOT NULL,
  proof_storage_key     VARCHAR(255) NOT NULL UNIQUE,
  proof_original_name   VARCHAR(255) NOT NULL,
  proof_mime_type       VARCHAR(80) NOT NULL,
  proof_size_bytes      INTEGER NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  rejection_reason      VARCHAR(500),
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_transfer_submissions_attempt_unique UNIQUE (order_id, attempt_number),
  CONSTRAINT bank_transfer_submissions_attempt_check CHECK (attempt_number > 0),
  CONSTRAINT bank_transfer_submissions_size_check CHECK (proof_size_bytes > 0),
  CONSTRAINT bank_transfer_submissions_status_check
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  CONSTRAINT bank_transfer_submissions_rejection_check CHECK (
    status <> 'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) >= 3)
  )
);

DROP TRIGGER IF EXISTS bank_transfer_submissions_updated_at ON bank_transfer_submissions;
CREATE TRIGGER bank_transfer_submissions_updated_at
  BEFORE UPDATE ON bank_transfer_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_bank_transfer_submissions_order
  ON bank_transfer_submissions(order_id, attempt_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transfer_one_pending
  ON bank_transfer_submissions(order_id) WHERE status = 'pending_review';
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transfer_one_approved
  ON bank_transfer_submissions(order_id) WHERE status = 'approved';

-- Un rechazo puede emitir un nuevo enlace sin invalidar el enlace original.
-- Igual que el token principal del pedido, solo se conserva su SHA-256.
CREATE TABLE IF NOT EXISTS bank_transfer_guest_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_guest_tokens_order
  ON bank_transfer_guest_tokens(order_id, expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Analítica de visitas
-- ─────────────────────────────────────────────────────────────────────────────
-- El dueño pidió ver cuánta gente entra a la tienda por día. En vez de sumar un
-- servicio externo (Google Analytics / Plausible), cada visita de página la
-- registra el propio frontend con un beacon y queda en esta tabla.
--
-- No se guarda la IP. `visitor_hash` es un SHA-256 de (sal del día + IP +
-- user-agent) y la sal rota cada día: alcanza para contar visitantes únicos
-- dentro de una misma jornada sin poder identificar a nadie ni seguir a una
-- persona de un día para otro. `is_bot` marca el tráfico automático (buscadores,
-- monitores, unfurl de links) para poder excluirlo del resumen.
--
-- PK entera y no UUID: es una tabla de solo-append con muchas más inserciones
-- que el resto; una clave monótona no fragmenta el índice como sí lo haría un
-- UUID aleatorio. El job backend/jobs/prunePageViews.js la mantiene acotada.
CREATE TABLE IF NOT EXISTS page_views (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path          VARCHAR(255) NOT NULL,
  referrer_host VARCHAR(255),
  visitor_hash  CHAR(64)     NOT NULL,
  is_bot        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- El resumen del panel siempre consulta por rango de fechas y sin bots.
CREATE INDEX IF NOT EXISTS idx_page_views_created_at
  ON page_views(created_at DESC) WHERE is_bot = FALSE;
