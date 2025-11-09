import os
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL")

DB_CONFIG = {
    "host": os.getenv("PGHOST", "localhost"),
    "port": int(os.getenv("PGPORT", 5432)),
    "dbname": os.getenv("PGDATABASE", "inventory_db"),
    "user": os.getenv("PGUSER", "postgres"),
    "password": os.getenv("PGPASSWORD", "postgres"),
    # For hosted providers (e.g., Neon), SSL is required
    "sslmode": os.getenv("PGSSLMODE", "require"),
}

# Optional Neon endpoint id to support clients without SNI-capable libpq
PGENDPOINT = os.getenv("PGENDPOINT")  # e.g. ep-soft-moon-123456
if PGENDPOINT:
    # Neon expects options=endpoint=<endpoint-id>
    DB_CONFIG["options"] = f"endpoint={PGENDPOINT}"

def get_conn():
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return psycopg2.connect(cursor_factory=RealDictCursor, **DB_CONFIG)

def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            category VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            price NUMERIC(10,2) NOT NULL DEFAULT 0.00
        );
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        """
    )
    conn.commit()
    conn.close()
