const API = 'http://localhost:3000/api';
const ceo = JSON.parse(localStorage.getItem('kiwas_ceo') || 'null');
const TOKEN = ceo ? ceo.token : null;
const orderId = new URLSearchParams(window.location.search).get('id');

let invoiceData = null;
let invoiceItems = [];
let deliveryFee = 0;

function logout() {
  localStorage.removeItem('kiwas_ceo');
  location.href = 'login.html';
}

function authFetch(url, options = {}) {
  options.headers = Object.assign({}, options.headers, { Authorization: `Bearer ${TOKEN}` });
  return fetch(url, options).then(res => {
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('CEO session expired');
    }
    return res;
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function deliveryLabel(method) {
  if (method === 'delivery') return 'kiwassons Delivery';
  if (method === 'self') return 'Client Own Transport';
  return 'Pickup at Store';
}

function money(value) {
  return 'KES ' + Number(value || 0).toLocaleString();
}

function showMessage(text, type = 'success') {
  const el = document.getElementById('invoice-message');
  el.textContent = text;
  el.className = 'invoice-message ' + type;
  el.style.display = 'block';
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function renderStatus(status) {
  const badge = document.getElementById('invoice-status-badge');
  const labels = {
    pending: 'Invoice Pending Verification',
    draft: 'Draft Saved - Not Sent',
    sent: 'Invoice Sent to Client',
    paid: 'Invoice Paid'
  };
  badge.textContent = labels[status] || status;
  badge.className = 'invoice-badge status-' + (status || 'pending');
}

function renderItems() {
  const tbody = document.getElementById('invoice-items');
  tbody.innerHTML = invoiceItems.map((item, index) => `
    <tr>
      <td><input type="number" min="1" class="qty-input" data-index="${index}" value="${Number(item.quantity) || 1}"></td>
      <td><input type="text" class="desc-input" data-index="${index}" value="${escapeHtml(item.description)}" placeholder="Goods / service description"></td>
      <td><input type="number" min="0" step="0.01" class="price-input" data-index="${index}" value="${Number(item.unit_price) || 0}"></td>
      <td class="line-total" id="line-total-${index}">${money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</td>
      <td><button type="button" class="action-btn delete" data-remove="${index}">Remove</button></td>
    </tr>
  `).join('');
  recalculate();
}

function recalculate() {
  let subtotal = 0;
  invoiceItems.forEach((item, index) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const price = Math.max(0, Number(item.unit_price) || 0);
    const lineTotal = qty * price;
    subtotal += lineTotal;
    const lineEl = document.getElementById(`line-total-${index}`);
    if (lineEl) lineEl.textContent = money(lineTotal);
  });
  document.getElementById('inv-subtotal').textContent = money(subtotal);
  document.getElementById('inv-total').textContent = money(subtotal);
  return subtotal;
}

function collectItems() {
  return invoiceItems.map(item => ({
    description: String(item.description || '').trim(),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit_price: Math.max(0, parseFloat(item.unit_price) || 0)
  })).filter(item => item.description);
}

function renderInvoice(data) {
  invoiceData = data;
  invoiceItems = (data.items || []).map(item => ({
    description: item.description || '',
    quantity: Number(item.quantity) || 1,
    unit_price: Number(item.unit_price) || 0
  }));

  document.getElementById('inv-order-number').textContent = data.order_number;
  document.getElementById('inv-number').textContent = data.invoice_number || '--';
  document.getElementById('inv-date').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('inv-client-name').textContent = data.name;
  document.getElementById('inv-client-contact').textContent = `${data.email}${data.phone ? ' | ' + data.phone : ''}`;
  document.getElementById('inv-client-address').value = data.delivery_address || data.address || 'Murang\'a, Kenya';
  document.getElementById('inv-order-date').textContent = new Date(data.created_at).toLocaleDateString();
  document.getElementById('inv-delivery-method').textContent = deliveryLabel(data.delivery_method);
  document.getElementById('inv-order-status').textContent = data.status;
  document.getElementById('invoice-notes').value = data.invoice_notes || 'Payment on collection. Thank you for shopping with kiwassons Auto Hardware.';
  renderStatus(data.invoice_status || 'pending');
  renderItems();
}

async function loadInvoice() {
  if (!orderId) {
    showMessage('No order selected. Go back to the orders list and choose an order.', 'error');
    return;
  }
  try {
    const res = await authFetch(`${API}/orders/${orderId}/invoice`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load invoice');
    renderInvoice(data);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function bindItemInputs() {
  document.getElementById('invoice-items').addEventListener('input', (event) => {
    const target = event.target;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    if (target.classList.contains('qty-input')) invoiceItems[index].quantity = Math.max(1, parseInt(target.value, 10) || 1);
    if (target.classList.contains('desc-input')) invoiceItems[index].description = target.value;
    if (target.classList.contains('price-input')) invoiceItems[index].unit_price = Math.max(0, parseFloat(target.value) || 0);
    recalculate();
  });

  document.getElementById('invoice-items').addEventListener('click', (event) => {
    const index = event.target.dataset.remove;
    if (index === undefined) return;
    if (invoiceItems.length === 1) {
      showMessage('The invoice must have at least one item.', 'error');
      return;
    }
    invoiceItems.splice(Number(index), 1);
    renderItems();
  });
}

async function saveInvoice(showSuccess = true) {
  const items = collectItems();
  if (!items.length) {
    showMessage('Add at least one item with a description before saving.', 'error');
    return false;
  }
  try {
    const res = await authFetch(`${API}/orders/${orderId}/invoice`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ items, notes: document.getElementById('invoice-notes').value, delivery_address: document.getElementById('inv-client-address').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save invoice');
    document.getElementById('inv-number').textContent = data.invoice_number;
    renderStatus(data.invoice_status);
    if (showSuccess) showMessage('Invoice draft saved. You can now send it to the client.');
    return true;
  } catch (err) {
    showMessage(err.message, 'error');
    return false;
  }
}

async function sendInvoice() {
  const saved = await saveInvoice(false);
  if (!saved) return;
  if (!confirm('Send this invoice to the client? They will receive a notification in the system.')) return;

  try {
    const res = await authFetch(`${API}/orders/${orderId}/invoice/send`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send invoice');
    document.getElementById('inv-number').textContent = data.invoice_number;
    renderStatus(data.invoice_status);
    document.getElementById('inv-order-status').textContent = data.status;
    showMessage(`Invoice ${data.invoice_number} sent. The client has been notified.`);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ceo || ceo.role !== 'admin' || !TOKEN) {
    location.href = 'login.html';
    return;
  }
  document.getElementById('ceo-name').textContent = `CEO: ${ceo.name}`;
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('add-item-btn')?.addEventListener('click', () => {
    invoiceItems.push({ description: '', quantity: 1, unit_price: 0 });
    renderItems();
  });
  document.getElementById('save-invoice-btn')?.addEventListener('click', () => saveInvoice(true));
  document.getElementById('send-invoice-btn')?.addEventListener('click', sendInvoice);
  bindItemInputs();
  loadInvoice();
});
