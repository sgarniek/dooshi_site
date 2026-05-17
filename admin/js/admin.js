// =============================================
// admin.js — לוח ניהול הזמנות ומוצרים
// =============================================

// תוויות וצבעים לסטטוס
const STATUS_LABELS   = { new: 'הזמנה התקבלה', approved: 'אושרה', ready: 'בהכנה', pickup: 'מוכן לאיסוף', done: 'הושלם', cancelled: 'בוטלה' };
const STATUS_CLASSES  = { new: 'status-new', approved: 'status-approved', ready: 'status-ready', pickup: 'status-pickup', done: 'status-done', cancelled: 'status-cancelled' };

const TIME_LABELS = { morning: '🌅 בוקר', afternoon: '🌆 אחה"צ' };

let adminPickupSlots    = [];
let pickupDateTab       = 'future';
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
          type:      row.type        || 'cookie',
          is_bundle: row.is_bundle   ?? false,
          emoji:     row.is_bundle ? '🎁' : (row.emoji && row.emoji !== '🍪' ? row.emoji : (row.type === 'muffin' ? '🧁' : '🍪')),
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
          ${order.items.map(item => { const match = products.find(prod => prod.name === item.product.name); return `${match?.emoji || item.product.emoji} ${item.product.name} ×${item.qty}`; }).join('<br>')}
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
function switchAdminSection(sectionName, clickedBtn) {
  document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
  clickedBtn.classList.add('active');
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('asec-' + sectionName).classList.add('active');
  if (sectionName === 'pickup')        renderPickupSlots();
  if (sectionName === 'customers')     renderCustomerView();
  if (sectionName === 'coupons')       renderCoupons();
  if (sectionName === 'notifications') renderNotifications();
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
      <td><div class="order-items-list">${o.items.map(i => { const match = products.find(prod => prod.name === i.product.name); return `${match?.emoji || i.product.emoji} ${i.product.name} ×${i.qty}`; }).join('<br>')}</div></td>
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

function switchPickupDateTab(tab, btn) {
  pickupDateTab = tab;
  document.querySelectorAll('.admin-pickup-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPickupSlotsTable();
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

  renderPickupSlotsTable();
}

function renderPickupSlotsTable() {
  const today = new Date().toISOString().split('T')[0];
  const list  = document.getElementById('pickupSlotsList');

  const slots = adminPickupSlots.filter(s =>
    pickupDateTab === 'future' ? s.slot_date >= today : s.slot_date < today
  );

  if (!slots.length) {
    list.innerHTML = `<div class="pickup-empty">${pickupDateTab === 'future' ? 'אין תאריכים עתידיים' : 'אין תאריכים שעברו'}</div>`;
    return;
  }

  const displaySlots = pickupDateTab === 'past' ? [...slots].reverse() : slots;

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
        ${displaySlots.map(slot => `
          <tr>
            <td>${formatAdminDate(slot.slot_date)}</td>
            <td>
              <div class="slot-time-toggles">
                <button class="slot-time-btn slot-time-morning ${slot.morning ? 'active' : ''}"
                        onclick="updatePickupSlot(${slot.id}, 'morning', ${!slot.morning})"
                        ${pickupDateTab === 'past' ? 'disabled' : ''}>
                  🌅 בוקר
                </button>
                <button class="slot-time-btn slot-time-afternoon ${slot.afternoon ? 'active' : ''}"
                        onclick="updatePickupSlot(${slot.id}, 'afternoon', ${!slot.afternoon})"
                        ${pickupDateTab === 'past' ? 'disabled' : ''}>
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

// =============================================
// קופונים
// =============================================

async function renderCoupons() {
  const listEl = document.getElementById('couponsList');
  listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">טוען...</div>';

  const [couponsRes, usagesRes] = await Promise.all([
    db.from('coupons').select('*').order('created_at', { ascending: false }),
    db.from('coupon_usages').select('coupon_id, customer_id'),
  ]);

  if (couponsRes.error) { listEl.innerHTML = '<div style="color:var(--rose)">שגיאה בטעינת קופונים</div>'; return; }

  const coupons = couponsRes.data || [];
  const usages  = usagesRes.data || [];

  if (!coupons.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:1rem 0;">אין קופונים מוגדרים</div>';
    return;
  }

  listEl.innerHTML = `
    <table class="orders-table" style="min-width:0;">
      <thead>
        <tr>
          <th>קוד</th>
          <th>הנחה</th>
          <th>מינימום</th>
          <th>שימושים/משתמש</th>
          <th>משתמשים</th>
          <th>שימושים</th>
          <th>תפוגה</th>
          <th>פעיל</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${coupons.map(c => {
          const useCount   = usages.filter(u => u.coupon_id === c.id).length;
          const userCount  = usages.filter(u => u.coupon_id === c.id).reduce((acc, u) => { acc.add(u.customer_id); return acc; }, new Set()).size;
          const discountLabel = c.type === 'fixed'
            ? `₪${c.value}`
            : `${c.value}%${c.max_discount ? ` (עד ₪${c.max_discount})` : ''}`;
          const usersLabel = c.allowed_user_ids ? `${c.allowed_user_ids.length} משתמשים` : 'כולם';
          return `
            <tr style="${c.active ? '' : 'opacity:0.5;'}">
              <td><strong style="font-family:monospace; letter-spacing:1px;">${c.code}</strong></td>
              <td>${discountLabel}</td>
              <td>${c.min_order_amount > 0 ? '₪' + c.min_order_amount : '—'}</td>
              <td>${c.max_usages_per_user}</td>
              <td>${usersLabel}</td>
              <td>${useCount} (${userCount} משתמשים)</td>
              <td>${c.expires_at ? new Date(c.expires_at + 'T00:00:00').toLocaleDateString('he-IL') : '—'}</td>
              <td>
                <label style="cursor:pointer;">
                  <input type="checkbox" ${c.active ? 'checked' : ''} onchange="toggleCouponActive('${c.id}', this.checked)" />
                </label>
              </td>
              <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" onclick="openCouponForm('${c.id}')">עריכה</button>
                ${c.allowed_user_ids?.length ? `<button class="btn btn-sm" style="background:var(--sage-light);color:var(--sage);border:1px solid var(--sage);border-radius:var(--radius);" onclick="sendCouponEmails('${c.id}')">📧 שלח</button>` : ''}
                <button class="btn btn-sm" style="background:var(--rose-light);color:var(--rose);border:1px solid var(--rose);border-radius:var(--radius);" onclick="deleteCoupon('${c.id}')">מחק</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function openCouponForm(couponId = null) {
  document.getElementById('couponFormPanel').style.display = '';
  document.getElementById('couponFormTitle').textContent = couponId ? 'עריכת קופון' : 'קופון חדש';
  document.getElementById('cfEditId').value = couponId || '';

  if (!couponId) {
    document.getElementById('cfCode').value = '';
    document.getElementById('cfValue').value = '';
    document.getElementById('cfMaxDiscount').value = '';
    document.getElementById('cfMinOrder').value = '0';
    document.getElementById('cfMaxUsages').value = '1';
    document.getElementById('cfExpiresAt').value = '';
    setCouponType('fixed');
    setCouponUsers('all');
    document.getElementById('cfUsersEmails').value = '';
    return;
  }

  db.from('coupons').select('*').eq('id', couponId).single().then(async ({ data: c }) => {
    if (!c) return;
    document.getElementById('cfCode').value      = c.code;
    document.getElementById('cfValue').value     = c.value;
    document.getElementById('cfMaxDiscount').value = c.max_discount || '';
    document.getElementById('cfMinOrder').value  = c.min_order_amount || 0;
    document.getElementById('cfMaxUsages').value  = c.max_usages_per_user || 1;
    document.getElementById('cfExpiresAt').value  = c.expires_at || '';
    setCouponType(c.type);

    if (c.allowed_user_ids && c.allowed_user_ids.length) {
      setCouponUsers('specific');
      const { data: customers } = await db.from('customers')
        .select('email').in('id', c.allowed_user_ids);
      document.getElementById('cfUsersEmails').value = (customers || []).map(c => c.email).join('\n');
    } else {
      setCouponUsers('all');
    }
  });
}

function closeCouponForm() {
  document.getElementById('couponFormPanel').style.display = 'none';
}

function setCouponType(type) {
  document.getElementById('cfType').value = type;
  document.getElementById('cfTypeFixed').classList.toggle('selected', type === 'fixed');
  document.getElementById('cfTypePercent').classList.toggle('selected', type === 'percentage');
  document.getElementById('cfValueLabel').textContent = type === 'fixed' ? 'סכום הנחה (₪)' : 'אחוז הנחה (%)';
  document.getElementById('cfMaxDiscountGroup').style.display = type === 'percentage' ? '' : 'none';
}

function setCouponUsers(mode) {
  document.getElementById('cfUsersType').value = mode;
  document.getElementById('cfUsersAll').classList.toggle('selected', mode === 'all');
  document.getElementById('cfUsersSpecific').classList.toggle('selected', mode === 'specific');
  document.getElementById('cfUsersEmailsGroup').style.display = mode === 'specific' ? '' : 'none';
}

async function saveCoupon() {
  const code      = document.getElementById('cfCode').value.trim().toUpperCase();
  const type      = document.getElementById('cfType').value;
  const value     = parseFloat(document.getElementById('cfValue').value);
  const maxDisc   = parseFloat(document.getElementById('cfMaxDiscount').value) || null;
  const minOrder  = parseFloat(document.getElementById('cfMinOrder').value) || 0;
  const maxUsages = parseInt(document.getElementById('cfMaxUsages').value) || 1;
  const usersType = document.getElementById('cfUsersType').value;
  const editId    = document.getElementById('cfEditId').value;

  if (!code)         { showToast('נא להזין קוד קופון', '⚠️'); return; }
  if (isNaN(value) || value <= 0) { showToast('נא להזין ערך הנחה', '⚠️'); return; }
  if (type === 'percentage' && value > 100) { showToast('אחוז הנחה מקסימלי הוא 100', '⚠️'); return; }

  let allowed_user_ids = null;
  if (usersType === 'specific') {
    const emails = document.getElementById('cfUsersEmails').value
      .split('\n').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!emails.length) { showToast('נא להזין לפחות מייל אחד', '⚠️'); return; }
    const { data: customers } = await db.from('customers').select('id').in('email', emails);
    if (!customers?.length) { showToast('לא נמצאו משתמשים עם המיילים שהוזנו', '⚠️'); return; }
    allowed_user_ids = customers.map(c => c.id);
  }

  const expiresAt = document.getElementById('cfExpiresAt').value || null;
  const payload = { code, type, value, max_discount: maxDisc, min_order_amount: minOrder, max_usages_per_user: maxUsages, allowed_user_ids, expires_at: expiresAt };

  if (editId) {
    const { error } = await db.from('coupons').update(payload).eq('id', editId);
    if (error) { showToast('שגיאה: ' + error.message, '❌'); return; }
  } else {
    const { error } = await db.from('coupons').insert({ ...payload, active: true });
    if (error) { showToast('שגיאה: ' + error.message, '❌'); return; }
  }

  closeCouponForm();
  showToast('קופון נשמר ✓', '✓');
  await renderCoupons();
}

async function toggleCouponActive(id, active) {
  const { error } = await db.from('coupons').update({ active }).eq('id', id);
  if (error) { showToast('שגיאה: ' + error.message, '❌'); await renderCoupons(); }
}

async function deleteCoupon(id) {
  if (!confirm('למחוק קופון זה?')) return;
  const { error } = await db.from('coupons').delete().eq('id', id);
  if (error) { showToast('שגיאה: ' + error.message, '❌'); return; }
  showToast('קופון נמחק', '○');
  await renderCoupons();
}

async function sendCouponEmails(couponId) {
  const { data: coupon } = await db.from('coupons').select('*').eq('id', couponId).single();
  if (!coupon?.allowed_user_ids?.length) return;

  if (!confirm(`לשלוח את קוד הקופון "${coupon.code}" ל-${coupon.allowed_user_ids.length} משתמשים?`)) return;

  const { data: customers } = await db.from('customers')
    .select('email, first_name')
    .in('id', coupon.allowed_user_ids);

  if (!customers?.length) { showToast('לא נמצאו משתמשים', '⚠️'); return; }

  const recipients = customers.map(c => ({ to: c.email, firstName: c.first_name }));

  try {
    const res = await fetch('https://dooshi.co.il/.netlify/functions/send-coupon-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients, coupon }),
    });
    if (!res.ok) throw new Error(await res.text());
    showToast(`נשלח ל-${recipients.length} משתמשים`, '');
  } catch (e) {
    console.error('Failed to send coupon emails:', e);
    showToast('שגיאה בשליחת המיילים', '❌');
  }
}

// =============================================
// התראות
// =============================================

async function renderNotifications() {
  const adminId    = sessionStorage.getItem('adminId');
  const adminEmail = sessionStorage.getItem('adminEmail');

  document.getElementById('notifAdminEmail').textContent = adminEmail || '';

  if (!adminId) return;

  const { data } = await db.from('admin_notification_settings')
    .select('event_type, enabled')
    .eq('admin_id', adminId);

  const settings = {};
  (data || []).forEach(r => { settings[r.event_type] = r.enabled; });

  document.getElementById('notifNewOrder').checked       = settings['new_order']       || false;
  document.getElementById('notifNewCustomer').checked    = settings['new_customer']    || false;
  document.getElementById('notifOrderModified').checked  = settings['order_modified']  || false;
  document.getElementById('notifOrderCancelled').checked = settings['order_cancelled'] || false;
}

async function saveNotificationSetting(eventType, enabled) {
  const adminId = sessionStorage.getItem('adminId');
  if (!adminId) return;

  const { error } = await db.from('admin_notification_settings')
    .upsert({ admin_id: adminId, event_type: eventType, enabled }, { onConflict: 'admin_id,event_type' });

  if (error) {
    showToast('שגיאה בשמירת ההגדרה', '❌');
    await renderNotifications();
  } else {
    showToast(enabled ? 'התראה הופעלה' : 'התראה כובתה', '✓');
  }
}
