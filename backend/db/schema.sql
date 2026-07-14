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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
  precio_costo      NUMERIC(14,2),
  precio_venta      NUMERIC(14,2),
  precio_iva        NUMERIC(14,2),
  precio_costo_usd  NUMERIC(14,2),       -- de compras KIAN (col L, precio final USD)
  stock             INTEGER       NOT NULL DEFAULT 0,
  source            VARCHAR(20)   NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('catalog','price_list','sale','purchase','manual')),
  supplier          VARCHAR(10)   GENERATED ALWAYS AS (
                       CASE
                         WHEN codigo LIKE 'ALC-%'        THEN 'ALCIDES'
                         WHEN codigo ~ '^[0-9]+[A-Z]*$'  THEN 'KIAN'
                         ELSE 'OTRO'
                       END
                     ) STORED,
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
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS size_options      JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_temp        NUMERIC(6,0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ip_rating         VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS material          VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cable_type        VARCHAR(60);
ALTER TABLE products ADD COLUMN IF NOT EXISTS published         BOOLEAN NOT NULL DEFAULT FALSE;

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
-- delivery). shipping_cost persiste lo que hoy solo se calculaba en el
-- frontend y se perdía. reservation_expires_at y stock_released_at sostienen
-- la reserva/liberación de stock (ver backend/services/stockReservation.js).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'mercadopago';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('mercadopago', 'pay_in_store'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ;

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
