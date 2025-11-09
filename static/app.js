const api = {
  async list(search = '') {
    const url = search ? `/api/products?search=${encodeURIComponent(search)}` : '/api/products';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
  },
  async stats() {
    const res = await fetch('/api/products/stats/value');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },
  async add(body) {
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Failed to add product');
    return res.json();
  },
  async update(id, body) {
    const res = await fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },
  async remove(id) {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete product');
  }
};

const tbody = document.querySelector('#products tbody');
const totalValueEl = document.getElementById('totalValue');
const overlay = document.getElementById('overlay');
const toastContainer = document.getElementById('toastContainer');
const editModal = document.getElementById('editModal');
const mName = document.getElementById('m_name');
const mCategory = document.getElementById('m_category');
const mQuantity = document.getElementById('m_quantity');
const mPrice = document.getElementById('m_price');
const modalSave = document.getElementById('modalSave');
const modalCancel = document.getElementById('modalCancel');
let editingId = null;

async function refresh(search = '') {
  showOverlay(true);
  try {
    const [items, { total }] = await Promise.all([
      api.list(search),
      api.stats()
    ]);
    render(items);
    totalValueEl.textContent = Number(total).toFixed(2);
  } finally {
    showOverlay(false);
  }
}

function render(items) {
  tbody.innerHTML = '';
  for (const p of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td><span class="badge">${p.category}</span></td>
      <td>${p.quantity}</td>
      <td>${Number(p.price).toFixed(2)}</td>
      <td>
        <span class="action" data-action="inc" data-id="${p.id}">+1</span>
        <span class="action" data-action="dec" data-id="${p.id}">-1</span>
        <span class="action" data-action="edit" data-id="${p.id}" data-name="${p.name}" data-category="${p.category}" data-quantity="${p.quantity}" data-price="${p.price}">Edit</span>
        <span class="action delete" data-action="del" data-id="${p.id}">Delete</span>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function getInputs() {
  return {
    name: document.getElementById('name').value.trim(),
    category: document.getElementById('category').value.trim(),
    quantity: Number(document.getElementById('quantity').value || 0),
    price: Number(document.getElementById('price').value || 0)
  };
}

function clearInputs() {
  document.getElementById('name').value = '';
  document.getElementById('category').value = '';
  document.getElementById('quantity').value = '';
  document.getElementById('price').value = '';
}

function showOverlay(show) {
  overlay.classList.toggle('hidden', !show);
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function openEditModal(product) {
  editingId = product.id;
  mName.value = product.name || '';
  mCategory.value = product.category || '';
  mQuantity.value = product.quantity ?? '';
  mPrice.value = product.price ?? '';
  editModal.classList.remove('hidden');
  // focus first input for convenience
  setTimeout(() => mName.focus(), 0);
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editingId = null;
}

// Event listeners

document.getElementById('addBtn').addEventListener('click', async () => {
  const body = getInputs();
  if (!body.name || !body.category) return alert('Name and Category are required');
  showOverlay(true);
  try {
    await api.add(body);
    clearInputs();
    await refresh();
    toast('Product added');
  } catch (e) {
    toast(e.message || 'Failed to add', 'error');
  } finally {
    showOverlay(false);
  }
});

document.getElementById('refreshBtn').addEventListener('click', () => refresh());

document.getElementById('searchBtn').addEventListener('click', () => {
  const q = document.getElementById('search').value.trim();
  refresh(q);
});

tbody.addEventListener('click', async (e) => {
  const target = e.target.closest('.action');
  if (!target) return;
  const id = Number(target.dataset.id);
  const action = target.dataset.action;
  try {
    if (action === 'inc') {
      await api.update(id, { quantity: '+1' }); // will be normalized below
    } else if (action === 'dec') {
      await api.update(id, { quantity: '-1' });
    } else if (action === 'del') {
      if (confirm('Delete this product?')) { await api.remove(id); toast('Deleted'); }
    } else if (action === 'edit') {
      openEditModal({
        id,
        name: target.dataset.name,
        category: target.dataset.category,
        quantity: Number(target.dataset.quantity),
        price: Number(target.dataset.price)
      });
    }
    await refresh();
  } catch (err) {
    toast(err.message || 'Operation failed', 'error');
  }
});

// Normalize +1/-1 quantity patch on the server by fetching current value
async function normalizeQuantityPatch(id, patch) {
  if (patch.quantity === '+1' || patch.quantity === '-1') {
    const items = await api.list();
    const item = items.find(i => i.id === id);
    if (!item) return patch;
    const next = item.quantity + (patch.quantity === '+1' ? 1 : -1);
    return { ...patch, quantity: next };
  }
  return patch;
}

// Monkey-patch api.update to handle +1/-1 flexibility
const _update = api.update;
api.update = async (id, body) => {
  const norm = await normalizeQuantityPatch(id, body);
  return _update(id, norm);
};

// Modal actions
modalCancel.addEventListener('click', () => closeEditModal());
modalSave.addEventListener('click', async () => {
  if (!editingId) return closeEditModal();
  const body = {};
  if (mName.value) body.name = mName.value;
  if (mCategory.value) body.category = mCategory.value;
  if (mQuantity.value) body.quantity = Number(mQuantity.value);
  if (mPrice.value) body.price = Number(mPrice.value);
  // If no fields changed/filled, just close modal without calling API
  if (Object.keys(body).length === 0) { closeEditModal(); return; }
  try {
    await api.update(editingId, body);
    toast('Saved');
    closeEditModal();
    await refresh();
  } catch (e) {
    toast(e.message || 'Failed to save', 'error');
  }
});

// Close modal on clicking outside the card (backdrop click)
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !editModal.classList.contains('hidden')) {
    closeEditModal();
  }
});

refresh().catch(err => alert(err.message));
