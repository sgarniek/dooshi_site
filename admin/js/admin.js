// =============================================
// admin.js — לוח ניהול הזמנות ומוצרים
// =============================================

// תוויות וצבעים לסטטוס
const STATUS_LABELS   = { new: 'הזמנה התקבלה', approved: 'אושרה', ready: 'בהכנה', pickup: 'מוכן לאיסוף', done: 'הושלם', cancelled: 'בוטלה' };
const STATUS_CLASSES  = { new: 'status-new', approved: 'status-approved', ready: 'status-ready', pickup: 'status-pickup', done: 'status-done', cancelled: 'status-cancelled' };

const TIME_LABELS = { morning: '🌅 בוקר', afternoon: '🌆 אחה"צ' };

let adminPickupSlots    = [];
let orderFilter         = { date: null, time: null };
let adminOrderTab       = 'active';
let adminCalYear        = null;
let adminCalMonth       = null;
let selectedNewSlotDate = '';

// -- טוען הזמנות ומוצרים מ-Supabase ומצייר את לוח הניהול --
async function renderAdmin() {
  const [ordersRes, productsRes] = await Promise.all([
    db.from('orders').select('*').order('id', { ascending: false }),
    db.from('product').select('product_id, name, price, description, image_url, active, type, emoji, is_bundle').order('product_id'),
  ]);

  if (ordersRes.error) { console.error('Supabase orders error:', ordersRes.error); return; }

  // מיפוי הזמנות
  orders = ordersRes.data.map(o => ({
    ...o,
    smsApproved:  o.sms_approved,
    smsReady:     o.sms_ready,
    paymentPaid:  o.payment_paid ?? false,
  }));

  // מיזוג הגדרות מוצרים מ-DB לתוך המערך המקומי
  if (productsRes.data) {
    productsRes.data.forEach(row => {
      let p = products.find(p => p.id === row.product_id);
      if (!p) {
        // מוצר חדש שנוסף דרך הממשק — מוסיף למערך המקומי
        products.push({
          id:        row.product_id,
          name:      row.name        || '',
          desc:      row.description || '',
          price:     row.price       || 0,
          emoji:     row.emoji       || '🍪',
          type:      row.type        || 'cookie',
          is_bundle: row.is_bundle   ?? false,
          active:    row.active      ?? true,
          image:     row.image_url   || null,
        });
      } else {
        if (row.name        != null) p.name      = row.name;
        if (row.price       != null) p.price     = row.price;
        if (row.description != null) p.desc      = row.description;
        if (row.image_url   != null) p.image     = row.image_url;
        if (row.active      != null) p.active    = row.active;
        if (row.is_bundle   != null) p.is_bundle = row.is_bundle;
      }
    });
  }

  renderAdminStats();
  _updateAdminOrderTabBadges();
  renderOrderFilters();
  renderOrdersTable();
  renderAdminProducts();
  renderPricing();
}

// =============================================
// טאבים של הזמנות
// =============================================
function _ordersForTab(tab) {
  if (tab === 'active')    return orders.filter(o => !['done', 'cancelled'].includes(o.status));
  if (tab === 'completed') return orders.filter(o => o.status === 'done');
  if (tab === 'cancelled') return orders.filter(o => o.status === 'cancelled');
  return orders;
}

function switchAdminOrderTab(tab, btn) {
  adminOrderTab = tab;
  orderFilter   = { date: null, time: null };   // reset pickup filter on tab switch
  document.querySelectorAll('.admin-order-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  _updateAdminOrderTabBadges();
  renderOrderFilters();
  renderOrdersTable();
}

function _updateAdminOrderTabBadges() {
  const labels = { active: 'פעילות', completed: 'הושלמו', cancelled: 'בוטלו' };
  document.querySelectorAll('.admin-order-tab').forEach(t => {
    const count = _ordersForTab(t.dataset.tab).length;
    t.textContent = count ? `${labels[t.dataset.tab]} (${count})` : labels[t.dataset.tab];
  });
}

// =============================================
// פילטר הזמנות לפי מועד איסוף
// =============================================
function renderOrderFilters() {
  const bar = document.getElementById('orderFilterBar');
  if (!bar) return;

  // Show pickup filter only on active tab (completed/cancelled are historical)
  if (adminOrderTab !== 'active') { bar.innerHTML = ''; bar.style.display = 'none'; return; }

  const tabOrders = _ordersForTab('active');
  const seen = new Map();
  tabOrders.forEach(o => {
    if (!o.pickup_date || !o.pickup_time) return;
    const key = o.pickup_date + '_' + o.pickup_time;
    if (!seen.has(key)) seen.set(key, { date: o.pickup_date, time: o.pickup_time });
  });

  if (!seen.size) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = '';

  const isAll = !orderFilter.date;
  let html = `<button class="order-filter-chip${isAll ? ' active' : ''}" onclick="setOrderFilter(null,null)">כל ההזמנות</button>`;

  [...seen.values()]
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time === 'morning' ? -1 : 1))
    .forEach(({ date, time }) => {
      const active = orderFilter.date === date && orderFilter.time === time;
      const count  = tabOrders.filter(o => o.pickup_date === date && o.pickup_time === time).length;
      html += `<button class="order-filter-chip order-filter-${time}${active ? ' active' : ''}"
                        onclick="setOrderFilter('${date}','${time}')">
                 ${TIME_LABELS[time]} · ${formatAdminDate(date)}
                 <span class="filter-chip-count">${count}</span>
               </button>`;
    });

  bar.innerHTML = html;
}

function setOrderFilter(date, time) {
  orderFilter = { date, time };
  renderOrderFilters();
  renderOrdersTable();
}

// =============================================
// סטטיסטיקות
// =============================================
function renderAdminStats() {
  const activeOrders  = orders.filter(o => o.status !== 'cancelled');
  const revenue       = activeOrders.reduce((sum, o) => sum + o.total, 0);
  const received      = activeOrders.filter(o => o.paymentPaid).reduce((sum, o) => sum + o.total, 0);
  const pendingCount  = orders.filter(o => o.status === 'new').length;
  const approvedCount = orders.filter(o => o.status === 'approved').length;

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">סה"כ הזמנות</div>
      <div class="stat-val">${orders.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">ממתינות לאישור</div>
      <div class="stat-val">${pendingCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">מאושרות / בהכנה</div>
      <div class="stat-val">${approvedCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">מחזור (₪)</div>
      <div class="stat-val">₪${revenue}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">התקבל (₪)</div>
      <div class="stat-val" style="color:var(--sage)">₪${received}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">הזמנות ששולמו</div>
      <div class="stat-val" style="color:var(--sage)">${activeOrders.filter(o => o.paymentPaid).length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">ממתינות לתשלום</div>
      <div class="stat-val" style="color:var(--gold)">${activeOrders.filter(o => !o.paymentPaid).length}</div>
    </div>
  `;
}

// =============================================
// טבלת הזמנות
// =============================================
function renderOrdersTable() {
  const tbody    = document.getElementById('ordersTableBody');
  const emptyMsg = document.getElementById('ordersEmpty');

  let visibleOrders = _ordersForTab(adminOrderTab);

  if (orderFilter.date) {
    visibleOrders = visibleOrders.filter(o =>
      o.pickup_date === orderFilter.date && o.pickup_time === orderFilter.time);
  }

  if (!visibleOrders.length) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  tbody.innerHTML = visibleOrders.map(order => `
    <tr>
      <!-- מספר הזמנה + תאריך -->
      <td>
        <strong>#${order.id}</strong>
        <br>
        <span style="font-size:0.75rem; color:var(--text-muted)">${order.ts}</span>
      </td>

      <!-- שם הלקוח -->
      <td>${order.name}</td>

      <!-- טלפון (LTR כי מספר) -->
      <td dir="ltr">${order.phone}</td>

      <!-- מועד איסוף -->
      <td>
        ${order.pickup_date
          ? `<div class="pickup-date-cell">
               <div class="pickup-date-val">${formatAdminDate(order.pickup_date)}</div>
               <div class="pickup-time-badge pickup-time-${order.pickup_time}">${TIME_LABELS[order.pickup_time] || ''}</div>
             </div>`
          : '<span style="color:var(--text-muted);font-size:0.8rem">—</span>'
        }
      </td>

      <!-- רשימת פריטים -->
      <td>
        <div class="order-items-list">
          ${order.items.map(item => `${item.product.emoji} ${item.product.name} ×${item.qty}`).join('<br>')}
        </div>
      </td>

      <!-- סכום -->
      <td><strong>₪${order.total}</strong></td>

      <!-- אופן תשלום -->
      <td>${order.payment === 'cash' ? '💵 מזומן' : '📱 Bit'}</td>

      <!-- סטטוס תשלום -->
      <td>
        ${order.status !== 'cancelled'
          ? `<select class="payment-status-select ${order.paymentPaid ? 'paid' : 'unpaid'}"
                     onchange="setPayment(${order.id}, this.value)">
               <option value="unpaid" ${!order.paymentPaid ? 'selected' : ''}>ממתין לתשלום</option>
               <option value="paid"   ${order.paymentPaid  ? 'selected' : ''}>✓ שולם</option>
             </select>`
          : '<span style="color:var(--text-muted); font-size:0.8rem">—</span>'
        }
      </td>

      <!-- הודעות WhatsApp שנשלחו -->
      <td>
        ${order.smsApproved ? '<div class="wa-sent-badge">💬 אישור</div>' : ''}
        ${order.smsReady    ? '<div class="wa-sent-badge">💬 מוכן</div>'  : ''}
        ${!order.smsApproved && !order.smsReady ? '<span style="color:var(--text-muted);font-size:0.8rem">—</span>' : ''}
      </td>

      <!-- סטטוס + פעולות -->
      <td>
        <div class="action-btns">
          ${buildActionButtons(order)}
        </div>
        ${order.notes ? `<div class="admin-order-detail">📝 ${order.notes}</div>` : ''}
      </td>
    </tr>
  `).join('');
}

// בונה את כפתורי הפעולה — דרופדאון סטטוס + WhatsApp ידני
function buildActionButtons(order) {
  const allStatuses = [
    { value: 'new',       label: 'הזמנה התקבלה' },
    { value: 'approved',  label: 'אושרה' },
    { value: 'ready',     label: 'בהכנה' },
    { value: 'pickup',    label: 'מוכן לאיסוף' },
    { value: 'done',      label: 'הושלם' },
    { value: 'cancelled', label: 'בוטלה' },
  ];

  const options = allStatuses
    .map(s => `<option value="${s.value}" ${order.status === s.value ? 'selected' : ''}>${s.label}</option>`)
    .join('');

  let buttons = `<select class="status-change-select ${STATUS_CLASSES[order.status]}"
                          onchange="changeStatus(${order.id}, this.value)">
                   ${options}
                 </select>`;

  // כפתורי WhatsApp ידניים (לשליחה חוזרת)
  if (order.smsApproved && order.status !== 'new' && order.status !== 'cancelled') {
    buttons += `<button class="btn btn-ghost btn-sm" onclick="openWhatsAppModal(${order.id}, 'approved')">💬 אישור</button>`;
  }
  if (order.status === 'pickup' && order.smsReady) {
    buttons += `<button class="btn btn-ghost btn-sm" onclick="openWhatsAppModal(${order.id}, 'ready')">💬 מוכן לאיסוף</button>`;
  }

  return buttons;
}

// =============================================
// פעולות על הזמנות
// =============================================

// שינוי סטטוס — עם שאלת WhatsApp בעת הצורך
async function changeStatus(orderId, newStatus) {
  const order = orders.find(o => o.id === orderId);
  if (!order || order.status === newStatus) return;

  const { error } = await db.from('orders').update({ status: newStatus }).eq('id', orderId);
  if (error) { showToast('שגיאה: ' + error.message, '!'); await renderAdmin(); return; }

  order.status = newStatus;

  // סטטוסים שמצדיקים שאלת WhatsApp
  if (newStatus === 'approved' || newStatus === 'pickup') {
    await renderAdmin();
    openWhatsAppConfirm(orderId, newStatus);
    return;
  }

  await renderAdmin();
  const toastMsg = { done: 'הושלם ✓', cancelled: 'ההזמנה בוטלה', new: 'הסטטוס עודכן', approved: 'ההזמנה אושרה', ready: 'בהכנה', pickup: 'מוכן לאיסוף' };
  showToast(toastMsg[newStatus] || 'הסטטוס עודכן', '✓');
}

// שינוי סטטוס תשלום
async function setPayment(orderId, value) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  const paid = value === 'paid';
  const { error } = await db.from('orders').update({ payment_paid: paid }).eq('id', orderId);
  if (error) { showToast('שגיאה: ' + error.message, '!'); return; }
  order.paymentPaid = paid;
  await renderAdmin();
  showToast(paid ? 'סומן כשולם ✓' : 'סומן כממתין לתשלום', paid ? '✓' : '!');
}

// =============================================
// WhatsApp — אישור שליחה לפני פתיחת המודל
// =============================================

function openWhatsAppConfirm(orderId, statusType) {
  const waType = statusType === 'approved' ? 'approved' : 'ready';
  const label  = statusType === 'approved' ? 'אישור הזמנה' : 'הזמנה מוכנה לאיסוף';


  const overlay = document.getElementById('waConfirmModal');
  document.getElementById('waConfirmText').textContent = `האם לשלוח הודעת WhatsApp על ${label}?`;
  document.getElementById('waConfirmSend').onclick   = () => { closeWaConfirm(); openWhatsAppModal(orderId, waType); };
  document.getElementById('waConfirmSkip').onclick   = () => { closeWaConfirm(); showToast('הסטטוס עודכן ✓', '✓'); };
  overlay.classList.add('open');
}

function closeWaConfirm() {
  document.getElementById('waConfirmModal').classList.remove('open');
}

// =============================================
// WhatsApp Modal
// =============================================

// ממיר מספר טלפון ישראלי לפורמט WhatsApp בינלאומי
// לדוגמה: "054-1234567" → "972541234567"
function formatPhoneForWhatsApp(phone) {
  const digits = phone.replace(/[\s\-\+]/g, '');
  return digits.startsWith('0') ? '972' + digits.slice(1) : digits;
}

function openWhatsAppModal(orderId, type) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const itemsText = order.items
    .map(item => `• ${item.product.name} ×${item.qty}`)
    .join('\n');

  let title, description, message;

  if (type === 'approved') {
    title       = 'WhatsApp — אישור הזמנה';
    description = `ההודעה תישלח ל-${order.phone}`;
    message =
      `שלום ${order.name} 😊\n` +
      `ההזמנה שלך מ-Dooshi אושרה! 🍪\n\n` +
      `מס׳ הזמנה: #${order.id}\n` +
      `${itemsText}\n\n` +
      `נעדכן אותך כשהכל מוכן לאיסוף 🤍\n` +
      `Dooshi – Homemade in Tel Aviv`;
  } else {
    title       = 'WhatsApp — ההזמנה מוכנה!';
    description = `ההודעה תישלח ל-${order.phone}`;
    message =
      `שלום ${order.name} 🎉\n` +
      `ההזמנה שלך מוכנה לאיסוף!\n\n` +
      `מס׳ הזמנה: #${order.id}\n` +
      `${itemsText}\n` +
      `סה"כ לתשלום: ₪${order.total}\n` +
      `תשלום: ${order.payment === 'cash' ? 'מזומן' : 'Bit'}\n\n` +
      `Dooshi 🍪 – Homemade in Tel Aviv`;
  }

  const waPhone = formatPhoneForWhatsApp(order.phone);
  const waUrl   = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;

  currentSMSAction = { id: orderId, type, waUrl };

  document.getElementById('smsModalTitle').textContent = title;
  document.getElementById('smsModalDesc').textContent  = description;
  document.getElementById('smsPreview').textContent    = message;

  document.getElementById('smsModal').classList.add('open');
}

// פתיחת WhatsApp עם ההודעה המוכנה
function confirmWhatsApp() {
  if (!currentSMSAction) return;

  const { id, type, waUrl } = currentSMSAction;
  const order = orders.find(o => o.id === id);

  // פתח WhatsApp מיד — לפני כל await, אחרת הדפדפן יחסום את החלון
  closeModal();
  window.open(waUrl, '_blank');

  // עדכן DB ו-UI ברקע
  if (order) {
    if (type === 'approved') {
      order.smsApproved = true;
      db.from('orders').update({ sms_approved: true }).eq('id', id);
    } else {
      order.smsReady = true;
      db.from('orders').update({ sms_ready: true }).eq('id', id);
    }
  }

  renderAdmin();
  showToast('WhatsApp נפתח — שלח את ההודעה 💬', '✓');
}

// =============================================
// טאבים
// =============================================
function switchAdminTab(tabName, clickedBtn) {
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
  clickedBtn.classList.add('active');
  document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById('atab-' + tabName).classList.add('active');
  if (tabName === 'pickup')    renderPickupSlots();
  if (tabName === 'customers') renderCustomerView();
}

// =============================================
// לקוחות — חיפוש ותצוגה
// =============================================

function clearCustomerSearch() {
  ['custFirst', 'custLast', 'custPhone', 'custFromDate', 'custToDate']
    .forEach(id => { document.getElementById(id).value = ''; });
  hideLastNameSuggestions();
  renderCustomerView();
}

// Returns non-cancelled orders matching current filter inputs
function _getFilteredOrders() {
  const first = document.getElementById('custFirst').value.trim().toLowerCase();
  const last  = document.getElementById('custLast').value.trim().toLowerCase();
  const phone = document.getElementById('custPhone').value.trim();
  const from  = document.getElementById('custFromDate').value;  // YYYY-MM-DD
  const to    = document.getElementById('custToDate').value;

  let filtered = orders.filter(o => o.status !== 'cancelled');
  if (first) filtered = filtered.filter(o => (o.name || '').toLowerCase().includes(first));
  if (last)  filtered = filtered.filter(o => (o.name || '').toLowerCase().includes(last));
  if (phone) filtered = filtered.filter(o => (o.phone || '').includes(phone));
  if (from)  filtered = filtered.filter(o => o.pickup_date && o.pickup_date >= from);
  if (to)    filtered = filtered.filter(o => o.pickup_date && o.pickup_date <= to);
  return filtered;
}

function renderCustomerView() {
  const filtered  = _getFilteredOrders();
  const container = document.getElementById('customerResults');
  container.innerHTML = _buildSummaryPanel(filtered) + _buildOrdersTable(filtered);
}

// --- Summary panel (always shown) ---
function _buildSummaryPanel(filtered) {
  if (!filtered.length) return '<div class="cust-hint">לא נמצאו הזמנות</div>';

  const total           = filtered.reduce((s, o) => s + o.total, 0);
  const uniqueCustomers = new Set(filtered.map(o => o.phone)).size;

  const itemMap = {};
  filtered.forEach(o => o.items.forEach(i => {
    if (!itemMap[i.product.name]) itemMap[i.product.name] = { emoji: i.product.emoji, qty: 0, total: 0 };
    itemMap[i.product.name].qty   += i.qty;
    itemMap[i.product.name].total += i.qty * i.product.price;
  }));

  const itemRows = Object.entries(itemMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, { emoji, qty, total }]) => `
      <div class="cust-item-row">
        <span class="cust-item-name">${emoji} ${name}</span>
        <span class="cust-item-qty">× ${qty}</span>
        <span class="cust-item-total">₪${total}</span>
      </div>`).join('');

  return `
    <div class="cust-summary">
      <div class="cust-summary-stats">
        <div class="cust-stat">
          <div class="cust-stat-label">הזמנות</div>
          <div class="cust-stat-val">${filtered.length}</div>
        </div>
        <div class="cust-stat">
          <div class="cust-stat-label">לקוחות</div>
          <div class="cust-stat-val">${uniqueCustomers}</div>
        </div>
        <div class="cust-stat">
          <div class="cust-stat-label">סה"כ (₪)</div>
          <div class="cust-stat-val">₪${total}</div>
        </div>
      </div>
      ${itemRows ? `<div class="cust-breakdown">
        <div class="cust-breakdown-title">פירוט מוצרים</div>
        ${itemRows}
      </div>` : ''}
    </div>`;
}

// --- Orders table (all matching orders) ---
function _buildOrdersTable(filtered) {
  if (!filtered.length) return ''; // empty state already shown by _buildSummaryPanel

  const rows = filtered.map(o => `
    <tr>
      <td><strong>#${o.id}</strong><br>
        <span style="font-size:0.75rem;color:var(--text-muted)">${o.ts}</span></td>
      <td>${o.name}</td>
      <td dir="ltr">${o.phone}</td>
      <td>${o.pickup_date
        ? `<div class="pickup-date-cell">
             <div class="pickup-date-val">${formatAdminDate(o.pickup_date)}</div>
             <div class="pickup-time-badge pickup-time-${o.pickup_time}">${TIME_LABELS[o.pickup_time] || ''}</div>
           </div>`
        : '<span style="color:var(--text-muted);font-size:0.8rem">—</span>'}</td>
      <td><div class="order-items-list">${o.items.map(i => `${i.product.emoji} ${i.product.name} ×${i.qty}`).join('<br>')}</div></td>
      <td><strong>₪${o.total}</strong></td>
      <td>${o.payment === 'cash' ? '💵 מזומן' : '📱 Bit'}</td>
      <td><span class="status-badge ${STATUS_CLASSES[o.status] || ''}">${STATUS_LABELS[o.status] || o.status}</span></td>
    </tr>`).join('');

  return `
    <div class="orders-table-wrap" style="margin-top:1.5rem">
      <table class="orders-table">
        <thead><tr><th>מס׳</th><th>שם</th><th>טלפון</th><th>מועד איסוף</th><th>פריטים</th><th>סה"כ</th><th>תשלום</th><th>סטטוס</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// --- Last-name autocomplete ---
function showLastNameSuggestions() {
  const val      = document.getElementById('custLast').value.trim().toLowerCase();
  const dropdown = document.getElementById('lastNameDropdown');
  if (!val) { dropdown.style.display = 'none'; return; }

  const suggestions = [...new Set(
    orders
      .filter(o => o.status !== 'cancelled')
      .map(o => (o.name || '').trim().split(/\s+/).slice(1).join(' '))
      .filter(n => n && n.toLowerCase().includes(val))
  )].slice(0, 8);

  if (!suggestions.length) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = suggestions
    .map(n => `<div class="cust-suggestion" onmousedown="selectLastName('${n.replace(/'/g, "\\'")}')">${n}</div>`)
    .join('');
  dropdown.style.display = 'block';
}

function selectLastName(name) {
  document.getElementById('custLast').value = name;
  hideLastNameSuggestions();
  renderCustomerView();
}

function hideLastNameSuggestions() {
  const d = document.getElementById('lastNameDropdown');
  if (d) d.style.display = 'none';
}

// =============================================
// הוספת מוצר חדש
// =============================================
function openNewProductModal() {
  document.getElementById('newProdName').value     = '';
  document.getElementById('newProdType').value     = 'cookie';
  document.getElementById('newProdIsBundle').checked = false;
  document.getElementById('newProdPrice').value    = '';
  document.getElementById('newProdDesc').value     = '';
  document.getElementById('newProdImage').value    = '';
  // reset emoji picker to default
  document.getElementById('newProdEmoji').value = '🍪';
  document.querySelectorAll('#emojiPicker .emoji-opt').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.emoji === '🍪');
  });
  const btn = document.getElementById('newProdSaveBtn');
  btn.textContent = 'הוסף מוצר';
  btn.disabled = false;
  document.getElementById('newProductModal').classList.add('open');
  setTimeout(() => document.getElementById('newProdName').focus(), 50);
}

function closeNewProductModal() {
  document.getElementById('newProductModal').classList.remove('open');
}

function selectEmoji(btn) {
  document.querySelectorAll('#emojiPicker .emoji-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('newProdEmoji').value = btn.dataset.emoji;
}

function updateDefaultEmoji() {
  const type  = document.getElementById('newProdType').value;
  const emoji = type === 'muffin' ? '🧁' : type === 'bundle' ? '🎁' : '🍪';
  document.getElementById('newProdEmoji').value = emoji;
  document.querySelectorAll('#emojiPicker .emoji-opt').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.emoji === emoji);
  });
}

async function saveNewProduct() {
  const name     = document.getElementById('newProdName').value.trim();
  const type     = document.getElementById('newProdType').value;
  const isBundle = document.getElementById('newProdIsBundle').checked;
  const price    = parseInt(document.getElementById('newProdPrice').value, 10);
  const desc     = document.getElementById('newProdDesc').value.trim();
  const image    = document.getElementById('newProdImage').value.trim();
  const emoji    = document.getElementById('newProdEmoji').value.trim() || (type === 'muffin' ? '🧁' : '🍪');

  if (!name)                     { showToast('שם המוצר חובה', '!'); return; }
  if (isNaN(price) || price < 1) { showToast('מחיר לא תקין', '!'); return; }

  const btn = document.getElementById('newProdSaveBtn');
  btn.textContent = '...';
  btn.disabled = true;

  const nextId = Math.max(0, ...products.map(p => p.id)) + 1;

  const { error } = await db.from('product').insert({
    product_id:  nextId,
    name, price, type, emoji,
    is_bundle:   isBundle,
    description: desc  || null,
    image_url:   image || null,
    active:      true,
  });

  btn.textContent = 'הוסף מוצר';
  btn.disabled = false;

  if (error) { showToast('שגיאה: ' + error.message, '!'); return; }

  products.push({ id: nextId, name, price, desc, image: image || null, emoji, type, is_bundle: isBundle, active: true });

  closeNewProductModal();
  await renderAdmin();
  showToast(`${name} נוסף בהצלחה ✓`, '✓');
}

// =============================================
// הגדרות מוצרים (מחיר, תיאור, תמונה)
// =============================================
function renderPricing() {
  document.getElementById('pricingGrid').innerHTML = products.map(p => `
    <div class="pricing-card">
      <div class="pricing-card-header">
        <span class="pricing-emoji">${p.emoji}</span>
        <span class="pricing-name">${p.name}</span>
      </div>

      <div class="pricing-field">
        <label class="pricing-label">שם המוצר</label>
        <input class="pricing-url" type="text" id="name-${p.id}"
               value="${p.name || ''}" placeholder="שם המוצר" />
      </div>

      <div class="pricing-field">
        <label class="pricing-label">סוג</label>
        <select class="pricing-url" id="type-${p.id}" style="direction:rtl">
          <option value="cookie" ${p.type === 'cookie' ? 'selected' : ''}>🍪 עוגייה</option>
          <option value="muffin" ${p.type === 'muffin' ? 'selected' : ''}>🧁 מאפין</option>
        </select>
      </div>

      <div class="pricing-field">
        <label class="bundle-toggle-label">
          <input type="checkbox" id="bundle-${p.id}" ${p.is_bundle ? 'checked' : ''} />
          <span>🎁 מארז</span>
        </label>
      </div>

      <div class="pricing-field">
        <label class="pricing-label">מחיר</label>
        <div class="pricing-input-wrap">
          <span class="pricing-symbol">₪</span>
          <input class="pricing-input" type="number" min="1" step="1"
                 value="${p.price}" id="price-${p.id}" />
        </div>
      </div>

      <div class="pricing-field">
        <label class="pricing-label">תיאור</label>
        <textarea class="pricing-textarea" id="desc-${p.id}" rows="2"
                  placeholder="תיאור קצר של המוצר">${p.desc || ''}</textarea>
      </div>

      <div class="pricing-field">
        <label class="pricing-label">תמונה (URL)</label>
        <input class="pricing-url" type="text" id="image-${p.id}"
               placeholder="images/my-product.jpg"
               value="${p.image || ''}" />
      </div>

      <button class="btn btn-primary btn-sm pricing-save-btn"
              onclick="saveProductSettings(${p.id})">שמור</button>
    </div>
  `).join('');
}

async function saveProductSettings(productId) {
  const name     = document.getElementById('name-'   + productId).value.trim();
  const type     = document.getElementById('type-'   + productId).value;
  const isBundle = document.getElementById('bundle-' + productId).checked;
  const price    = parseInt(document.getElementById('price-' + productId).value, 10);
  const desc     = document.getElementById('desc-'   + productId).value.trim();
  const image    = document.getElementById('image-'  + productId).value.trim();

  if (!name)                       { showToast('שם המוצר לא יכול להיות ריק', '!'); return; }
  if (isNaN(price) || price < 1)   { showToast('מחיר לא תקין', '!'); return; }

  const { error } = await db.from('product').upsert(
    { product_id: productId, name, price, type, is_bundle: isBundle, description: desc, image_url: image },
    { onConflict: 'product_id' }
  );

  if (error) { showToast('שגיאה: ' + error.message, '!'); return; }

  const product = products.find(p => p.id === productId);
  if (product) {
    product.name      = name;
    product.type      = type;
    product.is_bundle = isBundle;
    product.price     = price;
    product.desc      = desc;
    product.image     = image || null;
  }

  showToast('הגדרות המוצר עודכנו ✓', '✓');
}

// =============================================
// מוצרים
// =============================================
function renderAdminProducts() {
  document.getElementById('adminProductsGrid').innerHTML = products.map(product => `
    <div class="product-admin-card ${product.active ? '' : 'product-admin-inactive'}">
      <div class="product-admin-img">
        ${product.image
          ? `<img src="../${product.image}" alt="${product.name}" />`
          : `<span class="product-admin-emoji">${product.emoji}</span>`}
      </div>
      <div class="product-admin-info">
        <div class="product-admin-name">${product.name}</div>
        <div class="product-admin-price">₪${product.price}</div>
      </div>
      <!-- מתג הפעלה/כיבוי -->
      <label class="toggle-switch" title="${product.active ? 'פעיל — לחץ לכיבוי' : 'מושבת — לחץ להפעלה'}">
        <input type="checkbox" ${product.active ? 'checked' : ''} onchange="toggleProduct(${product.id})">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');
}

// הפעלה/כיבוי מוצר — שומר ב-DB
async function toggleProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const newActive = !product.active;
  const { error } = await db.from('product').update({ active: newActive }).eq('product_id', productId);
  if (error) { showToast('שגיאה: ' + error.message, '!'); renderAdminProducts(); return; }

  product.active = newActive;
  renderAdminProducts();

  showToast(
    newActive ? `${product.name} הופעל בחנות` : `${product.name} הוסתר מהחנות`,
    newActive ? '✓' : '○'
  );
}

// =============================================
// ניהול תאריכי איסוף
// =============================================

function formatAdminDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// =============================================
// לוח שנה לבחירת תאריך חדש
// =============================================
function renderAdminPickupCalendar() {
  const now = new Date();
  if (adminCalYear === null) { adminCalYear = now.getFullYear(); adminCalMonth = now.getMonth(); }

  const today   = now.toISOString().split('T')[0];
  const slotMap = {};
  adminPickupSlots.forEach(s => { slotMap[s.slot_date] = s; });

  const firstDay    = new Date(adminCalYear, adminCalMonth, 1);
  const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
  const startDow    = firstDay.getDay();

  document.getElementById('adminCalMonthLabel').textContent =
    firstDay.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
  let html = '';
  dayNames.forEach(d => { html += `<div class="apk-dow">${d}</div>`; });

  for (let i = 0; i < startDow; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const mm      = String(adminCalMonth + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${adminCalYear}-${mm}-${dd}`;
    const slot    = slotMap[dateStr];
    const isPast  = dateStr < today;
    const isSel   = dateStr === selectedNewSlotDate;

    let cls  = 'apk-day';
    let dots = '';

    if (isPast) {
      cls += ' apk-past';
    } else if (slot) {
      cls += (slot.morning && slot.afternoon) ? ' apk-full' : ' apk-partial';
      if (slot.morning)   dots += '<span class="apk-dot apk-dot-m"></span>';
      if (slot.afternoon) dots += '<span class="apk-dot apk-dot-a"></span>';
    } else {
      cls += isSel ? ' apk-selected' : ' apk-free';
    }

    const click = (!isPast && !slot) ? `onclick="selectNewSlotDate('${dateStr}')"` : '';
    html += `<div class="${cls}" ${click}>${d}<div class="apk-dots">${dots}</div></div>`;
  }

  document.getElementById('adminCalGrid').innerHTML = html;
}

function openPickupCalendar() {
  selectedNewSlotDate = '';
  adminCalYear  = null;
  adminCalMonth = null;
  document.getElementById('newSlotForm').style.display  = 'none';
  document.getElementById('newSlotDate').value          = '';
  document.getElementById('newSlotMorning').checked     = false;
  document.getElementById('newSlotAfternoon').checked   = false;
  document.getElementById('apkWidget').style.display    = '';
  document.getElementById('addSlotBtnRow').style.display = 'none';
  renderAdminPickupCalendar();
}

function closePickupCalendar() {
  document.getElementById('apkWidget').style.display    = 'none';
  document.getElementById('addSlotBtnRow').style.display = '';
}

function selectNewSlotDate(dateStr) {
  selectedNewSlotDate = dateStr;
  document.getElementById('newSlotDate').value      = dateStr;
  document.getElementById('selectedSlotLabel').textContent = formatAdminDate(dateStr);
  document.getElementById('newSlotMorning').checked   = false;
  document.getElementById('newSlotAfternoon').checked = false;
  document.getElementById('newSlotForm').style.display = '';
  renderAdminPickupCalendar();
}

function prevAdminCalMonth() {
  adminCalMonth--;
  if (adminCalMonth < 0) { adminCalMonth = 11; adminCalYear--; }
  renderAdminPickupCalendar();
}

function nextAdminCalMonth() {
  adminCalMonth++;
  if (adminCalMonth > 11) { adminCalMonth = 0; adminCalYear++; }
  renderAdminPickupCalendar();
}

async function renderPickupSlots() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db.from('pickup_slots')
    .select('*')
    .order('slot_date');

  if (error) { document.getElementById('pickupSlotsList').innerHTML = '<div style="color:var(--rose)">שגיאה בטעינת תאריכים</div>'; return; }

  adminPickupSlots = data || [];
  if (document.getElementById('apkWidget')?.style.display !== 'none') {
    renderAdminPickupCalendar();
  }

  const list = document.getElementById('pickupSlotsList');
  if (!adminPickupSlots.length) {
    list.innerHTML = '<div class="pickup-empty">אין תאריכים מוגדרים</div>';
    return;
  }

  list.innerHTML = `
    <table class="pickup-table">
      <thead>
        <tr>
          <th>תאריך</th>
          <th>שעות זמינות</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${adminPickupSlots.map(slot => `
          <tr class="${slot.slot_date < today ? 'pickup-row-past' : ''}">
            <td>${formatAdminDate(slot.slot_date)}</td>
            <td>
              <div class="slot-time-toggles">
                <button class="slot-time-btn slot-time-morning ${slot.morning ? 'active' : ''}"
                        onclick="updatePickupSlot(${slot.id}, 'morning', ${!slot.morning})">
                  🌅 בוקר
                </button>
                <button class="slot-time-btn slot-time-afternoon ${slot.afternoon ? 'active' : ''}"
                        onclick="updatePickupSlot(${slot.id}, 'afternoon', ${!slot.afternoon})">
                  🌆 אחה"צ
                </button>
              </div>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="deletePickupSlot(${slot.id})"
                      style="color:var(--rose)">מחק</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function addPickupSlot() {
  const dateVal    = document.getElementById('newSlotDate').value;
  const morning    = document.getElementById('newSlotMorning').checked;
  const afternoon  = document.getElementById('newSlotAfternoon').checked;

  if (!dateVal)              { showToast('נא לבחור תאריך', '!'); return; }
  if (!morning && !afternoon){ showToast('נא לבחור לפחות שעת איסוף אחת', '!'); return; }

  const { error } = await db.from('pickup_slots').upsert(
    { slot_date: dateVal, morning, afternoon },
    { onConflict: 'slot_date' }
  );

  if (error) { showToast('שגיאה: ' + error.message, '!'); return; }

  closePickupCalendar();
  await renderPickupSlots();
  showToast('תאריך נוסף ✓', '✓');
}

async function updatePickupSlot(slotId, field, value) {
  const { error } = await db.from('pickup_slots').update({ [field]: value }).eq('id', slotId);
  if (error) { showToast('שגיאה: ' + error.message, '!'); await renderPickupSlots(); return; }
  const slot = adminPickupSlots.find(s => s.id === slotId);
  if (slot) slot[field] = value;
  showToast('עודכן ✓', '✓');
}

async function deletePickupSlot(slotId) {
  const slot = adminPickupSlots.find(s => s.id === slotId);
  const label = slot ? formatAdminDate(slot.slot_date) : 'תאריך זה';
  if (!confirm(`למחוק את ${label}?`)) return;

  const { error } = await db.from('pickup_slots').delete().eq('id', slotId);
  if (error) { showToast('שגיאה: ' + error.message, '!'); return; }

  await renderPickupSlots();
  showToast('תאריך נמחק', '○');
}
