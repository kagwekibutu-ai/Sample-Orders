const API = 'http://localhost:3000/api';
const ceo = JSON.parse(localStorage.getItem('kiwas_ceo') || 'null');
const TOKEN = ceo ? ceo.token : null;
let productCache = [];

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

function deliveryLabel(method) {
  if (method === 'delivery') return 'kiwassons Delivery';
  if (method === 'self') return 'Client Own Transport';
  return 'Pickup at Store';
}

function invoiceLabel(status) {
  if (status === 'sent') return 'Sent';
  if (status === 'draft') return 'Draft';
  if (status === 'paid') return 'Paid';
  return 'Pending';
}

function paymentLabel(status) {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  return 'Unpaid';
}

function timelineLabel(type) {
  const labels = {
    order_created: 'Order placed',
    invoice_verified: 'Goods verified',
    invoice_sent: 'Invoice sent',
    status_changed: 'Status update',
    payment_recorded: 'Payment received'
  };
  return labels[type] || type;
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function openInvoice(id) {
  location.href = `invoice.html?id=${id}`;
}

async function showSection(id) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  const section = document.getElementById(id);
  if (section) section.style.display = 'block';
  if (id === 'dashboard') await loadDashboard();
  if (id === 'orders') await loadOrders();
  if (id === 'records') await loadRecords();
  if (id === 'products') await loadProducts();
  if (id === 'users') await loadUsers();
  if (id === 'feedback') await loadFeedback();
}

async function loadDashboard() {
  try {
    const [ordersRes, recordsRes] = await Promise.all([
      authFetch(`${API}/orders/stats/summary`),
      authFetch(`${API}/records/summary`)
    ]);
    const data = await ordersRes.json();
    const records = await recordsRes.json();
    document.getElementById('stat-total-orders').textContent = data.total_orders;
    document.getElementById('stat-revenue').textContent = 'KES ' + Number(data.total_revenue).toLocaleString();
    document.getElementById('stat-pending').textContent = data.pending;
    document.getElementById('stat-ready').textContent = data.ready || 0;
    document.getElementById('stat-invoices-sent').textContent = records.invoices_sent || 0;
    document.getElementById('stat-paid').textContent = 'KES ' + Number(records.total_paid || 0).toLocaleString();
  } catch (e) { console.error(e); }
  loadRecentOrders();
}

async function loadRecentOrders() {
  try {
    const res = await authFetch(`${API}/orders`);
    const orders = await res.json();
    const recent = orders.slice(0, 5);
    const html = `
      <table>
        <thead><tr><th>Order #</th><th>Client</th><th>Total</th><th>Delivery</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${recent.map(o => `
          <tr>
            <td>${o.order_number}</td>
            <td>${o.name}</td>
            <td>KES ${Number(o.total).toLocaleString()}</td>
            <td>${deliveryLabel(o.delivery_method)}</td>
            <td><span class="status-badge status-${o.status}">${o.status}</span></td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
          </tr>
        `).join('')}</tbody>
      </table>`;
    document.getElementById('recent-orders').innerHTML = html;
  } catch (e) { console.error(e); }
}

async function loadOrders() {
  try {
    const status = document.getElementById('order-status-filter')?.value || '';
    const delivery = document.getElementById('order-delivery-filter')?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (delivery) params.set('delivery_method', delivery);
    const query = params.toString() ? `?${params.toString()}` : '';

    const res = await authFetch(`${API}/orders${query}`);
    const orders = await res.json();
    const html = `
      <table>
        <thead><tr><th>Order #</th><th>Client</th><th>Total</th><th>Delivery</th><th>Status</th><th>Invoice</th><th>Payment</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${orders.map(o => `
          <tr>
            <td>${o.order_number}</td>
            <td>${o.name}<br><small>${o.email}${o.phone ? ' | ' + o.phone : ''}</small></td>
            <td>KES ${Number(o.total).toLocaleString()}</td>
            <td>${deliveryLabel(o.delivery_method)}</td>
            <td>
              <select onchange="updateOrderStatus(${o.id}, this.value)">
                <option value="pending" ${o.status==='pending'?'selected':''}>Pending</option>
                <option value="processing" ${o.status==='processing'?'selected':''}>Processing</option>
                <option value="ready" ${o.status==='ready'?'selected':''}>Ready for Collection</option>
                <option value="completed" ${o.status==='completed'?'selected':''}>Completed</option>
                <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Cancelled</option>
              </select>
            </td>
            <td><span class="invoice-badge status-${o.invoice_status || 'pending'}">${invoiceLabel(o.invoice_status)}</span></td>
            <td>${paymentLabel(o.payment_status)}<br><small>Paid KES ${Number(o.amount_paid || 0).toLocaleString()} / ${Number(o.total).toLocaleString()}</small></td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td>
              <button class="action-btn" onclick="viewOrder(${o.id})">View</button>
              <button class="action-btn edit" onclick="openInvoice(${o.id})">Invoice</button>
              <button class="action-btn pay" onclick="recordPaymentFor(${o.id})">Payment</button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>`;
    document.getElementById('orders-table').innerHTML = html;
  } catch (e) { console.error(e); }
}

async function updateOrderStatus(id, status) {
  await authFetch(`${API}/orders/${id}/status`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ status })
  });
  loadOrders();
  loadDashboard();
}

async function viewOrder(id) {
  const res = await authFetch(`${API}/orders/${id}`);
  const o = await res.json();
  const method = deliveryLabel(o.delivery_method);
  let collectionInfo = 'Pickup at kiwassons Auto Hardware, Murang\'a';
  if (o.delivery_method === 'delivery') collectionInfo = `Delivery Address: ${o.delivery_address || 'Not provided'}`;
  if (o.delivery_method === 'self') collectionInfo = `Client Transport Details: ${o.delivery_details || 'Client is arranging own transport'}`;
  alert(
    `Order ${o.order_number}\n` +
    `Client: ${o.name} (${o.email}${o.phone ? ', ' + o.phone : ''})\n` +
    `Total: KES ${Number(o.total).toLocaleString()}\n` +
    `Status: ${o.status}\n` +
    `Invoice: ${o.invoice_status || 'pending'} (${o.invoice_number || 'not issued'})\n` +
    `Payment: ${paymentLabel(o.payment_status)} (Paid KES ${Number(o.amount_paid || 0).toLocaleString()} of KES ${Number(o.total).toLocaleString()})\n` +
    `Delivery Option: ${method}\n` +
    `${collectionInfo}\n` +
    `Notes: ${o.notes || 'None'}\n\n` +
    `Items:\n${o.items.map(i => `- ${i.description} x${i.quantity} @ KES ${Number(i.price).toLocaleString()}`).join('\n')}`
  );
}

async function loadRecords() {
  try {
    const [goodsRes, invoicesRes, paymentsRes, ordersRes, summaryRes] = await Promise.all([
      authFetch(`${API}/records/goods`),
      authFetch(`${API}/records/invoices`),
      authFetch(`${API}/records/payments`),
      authFetch(`${API}/orders`),
      authFetch(`${API}/records/summary`)
    ]);
    const [goods, invoices, payments, orders, summary] = await Promise.all([
      goodsRes.json(), invoicesRes.json(), paymentsRes.json(), ordersRes.json(), summaryRes.json()
    ]);
    renderGoodsRecords(goods);
    renderInvoicesRecords(invoices);
    renderPaymentsRecords(payments);
    populateRecordOrderSelects(orders);
    if (summary) {
      const sentEl = document.getElementById('stat-invoices-sent');
      const paidEl = document.getElementById('stat-paid');
      if (sentEl) sentEl.textContent = summary.invoices_sent || 0;
      if (paidEl) paidEl.textContent = 'KES ' + Number(summary.total_paid || 0).toLocaleString();
    }
  } catch (e) { console.error(e); }
}

function renderGoodsRecords(goods) {
  const el = document.getElementById('goods-records-table');
  if (!el) return;
  if (!goods.length) {
    el.innerHTML = '<p class="empty-state">No goods have been ordered yet.</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Order #</th><th>Client</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th><th>Order Status</th><th>Invoice</th><th>Date</th></tr></thead>
      <tbody>${goods.map(g => `
        <tr>
          <td>${esc(g.order_number)}</td>
          <td>${esc(g.client_name)}<br><small>${esc(g.client_email)}</small></td>
          <td>${esc(g.product_name)}</td>
          <td>${g.quantity}</td>
          <td>KES ${Number(g.unit_price).toLocaleString()}</td>
          <td>KES ${Number(g.line_total).toLocaleString()}</td>
          <td><span class="status-badge status-${esc(g.order_status)}">${esc(g.order_status)}</span></td>
          <td><span class="invoice-badge status-${esc(g.invoice_status || 'pending')}">${invoiceLabel(g.invoice_status)}</span></td>
          <td>${new Date(g.order_date).toLocaleDateString()}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

function renderInvoicesRecords(invoices) {
  const el = document.getElementById('invoices-records-table');
  if (!el) return;
  if (!invoices.length) {
    el.innerHTML = '<p class="empty-state">No invoices have been submitted yet.</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Invoice #</th><th>Order #</th><th>Client</th><th>Total</th><th>Invoice Status</th><th>Sent On</th><th>Payment</th><th>Balance</th><th>Actions</th></tr></thead>
      <tbody>${invoices.map(inv => {
        const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid || 0));
        return `
        <tr>
          <td>${esc(inv.invoice_number || 'Not issued')}</td>
          <td>${esc(inv.order_number)}</td>
          <td>${esc(inv.client_name)}<br><small>${esc(inv.client_email)}</small></td>
          <td>KES ${Number(inv.total).toLocaleString()}</td>
          <td><span class="invoice-badge status-${esc(inv.invoice_status || 'pending')}">${invoiceLabel(inv.invoice_status)}</span></td>
          <td>${inv.invoice_sent_at ? new Date(inv.invoice_sent_at).toLocaleString() : '-'}</td>
          <td>${paymentLabel(inv.payment_status)}<br><small>Paid KES ${Number(inv.amount_paid || 0).toLocaleString()}</small></td>
          <td>KES ${balance.toLocaleString()}</td>
          <td><button class="action-btn edit" onclick="openInvoice(${inv.id})">Open Invoice</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function renderPaymentsRecords(payments) {
  const el = document.getElementById('payments-records-table');
  if (!el) return;
  if (!payments.length) {
    el.innerHTML = '<p class="empty-state">No payments have been recorded yet.</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Date Paid</th><th>Order #</th><th>Client</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Notes</th></tr></thead>
      <tbody>${payments.map(p => `
        <tr>
          <td>${new Date(p.paid_at).toLocaleString()}</td>
          <td>${esc(p.order_number)}</td>
          <td>${esc(p.client_name)}<br><small>${esc(p.client_email)}</small></td>
          <td>KES ${Number(p.amount).toLocaleString()}</td>
          <td>${esc(p.method || 'Cash')}</td>
          <td>${esc(p.reference || '-')}</td>
          <td>${esc(p.recorded_by_name || 'CEO')}</td>
          <td>${esc(p.notes || '-')}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

function populateRecordOrderSelects(orders) {
  const paymentSelect = document.getElementById('payment-order');
  const timelineSelect = document.getElementById('timeline-order');
  const options = orders.map(o => {
    const balance = Math.max(0, Number(o.total) - Number(o.amount_paid || 0));
    return `<option value="${o.id}" data-total="${Number(o.total)}" data-balance="${balance}">${esc(o.order_number)} - ${esc(o.name)} - Balance KES ${balance.toLocaleString()}</option>`;
  }).join('');
  if (paymentSelect) paymentSelect.innerHTML = `<option value="">Select order...</option>${options}`;
  if (timelineSelect) timelineSelect.innerHTML = `<option value="">Select order...</option>${options}`;
}

function showRecordTab(tab) {
  document.querySelectorAll('.record-panel').forEach(panel => panel.style.display = 'none');
  const panel = document.getElementById(`record-${tab}`);
  if (panel) panel.style.display = 'block';
  document.querySelectorAll('.record-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

function updatePaymentBalanceHint() {
  const select = document.getElementById('payment-order');
  const amountInput = document.getElementById('payment-amount');
  const hint = document.getElementById('payment-balance-hint');
  if (!select || !hint) return;
  const option = select.options[select.selectedIndex];
  if (!select.value || !option) {
    hint.textContent = '';
    return;
  }
  const total = Number(option.dataset.total || 0);
  const balance = Number(option.dataset.balance || 0);
  hint.textContent = `Order total: KES ${total.toLocaleString()} | Balance: KES ${balance.toLocaleString()}`;
  if (amountInput) amountInput.value = balance > 0 ? balance : '';
}

async function recordPaymentFor(orderId) {
  await showSection('records');
  showRecordTab('payments');
  const select = document.getElementById('payment-order');
  if (select) {
    select.value = String(orderId);
    updatePaymentBalanceHint();
  }
}

async function recordPayment(event) {
  event.preventDefault();
  const orderId = document.getElementById('payment-order').value;
  const amount = document.getElementById('payment-amount').value;
  if (!orderId || !amount) return;

  const res = await authFetch(`${API}/records/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: Number(orderId),
      amount: Number(amount),
      method: document.getElementById('payment-method').value,
      reference: document.getElementById('payment-reference').value,
      paid_at: document.getElementById('payment-date').value,
      notes: document.getElementById('payment-notes').value
    })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to record payment');
    return;
  }
  alert(`Payment recorded. Balance: KES ${Number(data.balance).toLocaleString()}`);
  document.getElementById('payment-form').reset();
  document.getElementById('payment-balance-hint').textContent = '';
  await loadRecords();
  loadDashboard();
}

async function loadOrderTimeline() {
  const select = document.getElementById('timeline-order');
  const orderId = select ? select.value : '';
  if (!orderId) {
    alert('Select an order first');
    return;
  }
  const summaryEl = document.getElementById('timeline-summary');
  const listEl = document.getElementById('timeline-list');
  try {
    const res = await authFetch(`${API}/records/timeline/${orderId}`);
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to load timeline');
      return;
    }
    const o = data.order;
    summaryEl.innerHTML = `
      <strong>${esc(o.order_number)}</strong> - ${esc(o.client_name)} (${esc(o.client_email)})<br>
      Total: KES ${Number(o.total).toLocaleString()} | Paid: KES ${Number(o.amount_paid || 0).toLocaleString()} | Balance: KES ${Number(o.balance).toLocaleString()}<br>
      Status: <span class="status-badge status-${esc(o.status)}">${esc(o.status)}</span>
      Invoice: <span class="invoice-badge status-${esc(o.invoice_status || 'pending')}">${invoiceLabel(o.invoice_status)}</span>`;
    listEl.innerHTML = data.events.map(item => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <span class="timeline-type">${timelineLabel(item.type)}</span>
          <p>${esc(item.description || '')}</p>
          <small>${new Date(item.date).toLocaleString()}</small>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function loadProducts() {
  try {
    const res = await authFetch(`${API}/products`);
    productCache = await res.json();
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody>${productCache.map(p => `
          <tr>
            <td>${p.name}</td><td>${p.category}</td><td>KES ${Number(p.price).toLocaleString()}</td><td>${p.stock}</td>
            <td>
              <button class="action-btn edit" onclick="editProduct(${p.id})">Edit</button>
              <button class="action-btn delete" onclick="deleteProduct(${p.id})">Delete</button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>`;
    document.getElementById('products-table').innerHTML = html;
  } catch (e) { console.error(e); }
}

function showProductForm() {
  document.getElementById('product-form').style.display = 'block';
  document.getElementById('edit-product-id').value = '';
  ['prod-name','prod-category','prod-price','prod-stock','prod-image'].forEach(id => document.getElementById(id).value = '');
}

function hideProductForm() {
  document.getElementById('product-form').style.display = 'none';
}

function editProduct(id) {
  const p = productCache.find(item => item.id === id);
  if (!p) return;
  document.getElementById('edit-product-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-category').value = p.category;
  document.getElementById('prod-price').value = p.price;
  document.getElementById('prod-stock').value = p.stock;
  document.getElementById('prod-image').value = p.image || '';
  document.getElementById('product-form').style.display = 'block';
}

async function saveProduct() {
  const id = document.getElementById('edit-product-id').value;
  const product = {
    name: document.getElementById('prod-name').value,
    category: document.getElementById('prod-category').value,
    price: parseFloat(document.getElementById('prod-price').value),
    stock: parseInt(document.getElementById('prod-stock').value),
    image: document.getElementById('prod-image').value
  };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API}/products/${id}` : `${API}/products`;
  await authFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(product) });
  hideProductForm();
  loadProducts();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await authFetch(`${API}/products/${id}`, { method: 'DELETE' });
  loadProducts();
}

async function loadUsers() {
  try {
    const res = await authFetch(`${API}/users`);
    const users = await res.json();
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Address</th><th>Joined</th></tr></thead>
        <tbody>${users.map(u => `
          <tr><td>${u.name}</td><td>${u.email}</td><td>${u.phone || '-'}</td><td>${u.address || '-'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>
        `).join('')}</tbody>
      </table>`;
    document.getElementById('users-table').innerHTML = html;
  } catch (e) { console.error(e); }
}

async function loadFeedback() {
  try {
    const res = await authFetch(`${API}/feedback`);
    const feedbacks = await res.json();
    const html = `
      <table>
        <thead><tr><th>Ref</th><th>Name</th><th>Email</th><th>WhatsApp</th><th>Subject</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${feedbacks.map(f => `
          <tr>
            <td>#FB-${f.id}</td>
            <td>${f.name}</td>
            <td>${f.email}</td>
            <td>${f.whatsapp}</td>
            <td>${f.subject}</td>
            <td>
              <select onchange="updateFeedbackStatus(${f.id}, this.value)">
                <option value="new" ${f.status==='new'?'selected':''}>New</option>
                <option value="contacted" ${f.status==='contacted'?'selected':''}>Contacted</option>
                <option value="resolved" ${f.status==='resolved'?'selected':''}>Resolved</option>
                <option value="closed" ${f.status==='closed'?'selected':''}>Closed</option>
              </select>
            </td>
            <td>${new Date(f.created_at).toLocaleDateString()}</td>
            <td><button class="action-btn" onclick="viewFeedback(${f.id})">View</button></td>
          </tr>
        `).join('')}</tbody>
      </table>`;
    document.getElementById('feedback-table').innerHTML = html;
  } catch (e) { console.error(e); }
}

async function updateFeedbackStatus(id, status) {
  await authFetch(`${API}/feedback/${id}/status`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ status })
  });
  loadFeedback();
}

async function viewFeedback(id) {
  const res = await authFetch(`${API}/feedback/${id}`);
  const f = await res.json();
  alert(`Feedback #FB-${f.id}\nName: ${f.name}\nEmail: ${f.email}\nPhone: ${f.phone}\nWhatsApp: ${f.whatsapp}\nSubject: ${f.subject}\nStatus: ${f.status}\n\nMessage:\n${f.message}\n\nSubmitted: ${new Date(f.created_at).toLocaleString()}`);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!ceo || ceo.role !== 'admin' || !TOKEN) {
    location.href = 'login.html';
    return;
  }
  const nameEl = document.getElementById('ceo-name');
  if (nameEl) nameEl.textContent = `CEO: ${ceo.name}`;
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('order-status-filter')?.addEventListener('change', loadOrders);
  document.getElementById('order-delivery-filter')?.addEventListener('change', loadOrders);
  document.getElementById('payment-order')?.addEventListener('change', updatePaymentBalanceHint);
  document.getElementById('payment-form')?.addEventListener('submit', recordPayment);
  const initial = location.hash === '#orders' ? 'orders' : location.hash === '#records' ? 'records' : 'dashboard';
  showSection(initial);
});
