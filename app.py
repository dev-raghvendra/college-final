import os
from dotenv import load_dotenv

# Load environment variables before importing db to ensure config picks them up
load_dotenv()

from flask import Flask, request, jsonify, send_from_directory
from db import init_db, get_conn

app = Flask(__name__, static_folder='static')
 

@app.route('/')
def root():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.get('/api/products')
def list_products():
    search = request.args.get('search', '').strip()
    conn = get_conn()
    cur = conn.cursor()
    if search:
        like = f"%{search}%"
        cur.execute(
            "SELECT * FROM products WHERE name ILIKE %s OR category ILIKE %s ORDER BY id DESC",
            (like, like),
        )
    else:
        cur.execute("SELECT * FROM products ORDER BY id DESC")
    rows = cur.fetchall()
    conn.close()
    return jsonify(rows)

@app.get('/api/products/stats/value')
def total_value():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(SUM(quantity * price), 0) AS total FROM products")
    total = cur.fetchone()["total"]
    conn.close()
    return jsonify({"total": float(total)})

@app.post('/api/products')
def add_product():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    category = (data.get('category') or '').strip()
    quantity = data.get('quantity', 0)
    price = data.get('price', 0)
    if not name or not category:
        return jsonify({"error": "name and category are required"}), 400
    try:
        qty = int(quantity)
        pr = float(price)
    except Exception:
        return jsonify({"error": "quantity and price must be numbers"}), 400

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO products (name, category, quantity, price) VALUES (%s, %s, %s, %s) RETURNING *",
        (name, category, qty, pr),
    )
    row = cur.fetchone()
    conn.commit()
    conn.close()
    return jsonify(row), 201

@app.put('/api/products/<int:pid>')
def update_product(pid: int):
    data = request.get_json(force=True)
    fields = []
    values = []
    if 'name' in data: fields.append('name=%s'); values.append(data['name'])
    if 'category' in data: fields.append('category=%s'); values.append(data['category'])
    if 'quantity' in data:
        try:
            values.append(int(data['quantity']))
            fields.append('quantity=%s')
        except Exception:
            return jsonify({"error": "quantity must be number"}), 400
    if 'price' in data:
        try:
            values.append(float(data['price']))
            fields.append('price=%s')
        except Exception:
            return jsonify({"error": "price must be number"}), 400

    if not fields:
        return jsonify({"error": "no fields to update"}), 400

    values.append(pid)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id=%s RETURNING *", values)
    row = cur.fetchone()
    conn.commit()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(row)

@app.delete('/api/products/<int:pid>')
def delete_product(pid: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id=%s", (pid,))
    count = cur.rowcount
    conn.commit()
    conn.close()
    if count == 0:
        return jsonify({"error": "not found"}), 404
    return ('', 204)

if __name__ == '__main__':
    # Initialize database tables at startup
    init_db()
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=True)
