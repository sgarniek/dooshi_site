// =============================================
// admin.js — לוח ניהול הזמנות ומוצרים
// =============================================

// תוויות וצבעים לסטטוס
const STATUS_LABELS   = { new: 'חדשה', approved: 'מאושרת', ready: 'מוכנה', done: 'הושלמה' };
const STATUS_CLASSES  = { new: 'status-new', approved: 'status-approved', ready: 'status-ready', done: 'status-done' };

// -- טוען הזמנות מ-Supabase ומצייר את לוח הניהול --
async function renderAdmin() {
  const { data, error } = await db.from('orders')
    .select('*')
    .order('id', { ascending: false });

  if (error) { console.error('Supabase error:', error); return; }

  // מיפוי snake_case → camelCase
  orders = data.map(o => ({
    ...o,
    smsApproved: o.sms_approved,
    smsReady:    o.sms_ready,
  }));

  renderAdminStats();
  renderOrdersTable();
  renderAdminProducts();
}

// =============================================
// סטטיסטיקות
// =============================================
function renderAdminStats() {
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  const pendingCount = orders.filter(o => o.status === 'new').length;
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
      <div class="stat-val">₪${total}</div>
    </div>
  `;
}

// =============================================
// טבלת הזמנות
// =============================================
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  const emptyMsg = document.getElementById('ordersEmpty');

  if (!orders.length) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  tbody.innerHTML = orders.map(order => `
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

      <!-- רשימת פריטים -->
      <td>
        <div class="order-items-list">
          ${order.items.map(item => `${item.product.emoji} ${item.product.name} ×${item.qty}`).join('<br>')}
        </div>
      </td>

      <!-- סכום -->
      <td><strong>₪${order.total}</strong></td>

      <!-- אמצעי תשלום -->
      <td>${order.payment === 'cash' ? '💵 מזומן' : '📱 Bit'}</td>

      <!-- סטטוס + אינדיקטורי SMS -->
      <td>
        <span class="status-badge ${STATUS_CLASSES[order.status]}">
          <span class="status-dot"></span>
          ${STATUS_LABELS[order.status]}
        </span>
        ${order.smsApproved ? '<div class="sms-sent-badge">💬 WhatsApp אישור נשלח</div>' : ''}
        ${order.smsReady    ? '<div class="sms-sent-badge">💬 WhatsApp מוכן נשלח</div>'  : ''}
      </td>

      <!-- כפתורי פעולה -->
      <td>
        <div class="action-btns">
          ${buildActionButtons(order)}
        </div>
        ${order.notes ? `<div class="admin-order-detail">📝 ${order.notes}</div>` : ''}
      </td>
    </tr>
  `).join('');
}

// בונה את הכפתורים לפי הסטטוס הנוכחי
function buildActionButtons(order) {
  let buttons = '';

  // מעבר לסטטוס הבא
  if (order.status === 'new') {
    buttons += `<button class="btn btn-primary btn-sm" onclick="approveOrder(${order.id})">✓ אשר</button>`;
  }
  if (order.status === 'approved') {
    buttons += `<button class="btn btn-caramel btn-sm" onclick="markReady(${order.id})">🍪 מוכן!</button>`;
  }
  if (order.status === 'ready') {
    buttons += `<button class="btn btn-success btn-sm" onclick="markDone(${order.id})">✓ נמסר</button>`;
  }

  // כפתורי WhatsApp
  if (!order.smsApproved && order.status !== 'new') {
    buttons += `<button class="btn btn-ghost btn-sm" onclick="openWhatsAppModal(${order.id}, 'approved')">💬 WhatsApp אישור</button>`;
  }
  if (order.status === 'ready' && !order.smsReady) {
    buttons += `<button class="btn btn-ghost btn-sm" onclick="openWhatsAppModal(${order.id}, 'ready')">💬 WhatsApp מוכן</button>`;
  }

  return buttons;
}

// =============================================
// פעולות על הזמנות
// =============================================

// אישור הזמנה חדשה → פותח WhatsApp אוטומטית
async function approveOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'approved';
  await db.from('orders').update({ status: 'approved' }).eq('id', orderId);
  openWhatsAppModal(orderId, 'approved');
}

// סימון הזמנה כמוכנה לאיסוף → פותח WhatsApp
async function markReady(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'ready';
  await db.from('orders').update({ status: 'ready' }).eq('id', orderId);
  openWhatsAppModal(orderId, 'ready');
}

// סימון כנמסרה
async function markDone(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'done';
  await db.from('orders').update({ status: 'done' }).eq('id', orderId);
  renderAdmin();
  showToast('ההזמנה סומנה כנמסרה', '✓');
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
    .map(item => `${item.product.name} ×${item.qty}`)
    .join(', ');

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
  // כפתורים
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
  clickedBtn.classList.add('active');

  // תוכן
  document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById('atab-' + tabName).classList.add('active');
}

// =============================================
// מוצרים
// =============================================
function renderAdminProducts() {
  document.getElementById('adminProductsGrid').innerHTML = products.map(product => `
    <div class="product-admin-card">
      <div class="product-admin-emoji">${product.emoji}</div>
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

// הפעלה/כיבוי מוצר
function toggleProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  product.active = !product.active;

  // עדכון לוח הניהול (ואם קיימת גם החנות — עדכן אותה)
  if (typeof renderProducts === 'function') renderProducts();
  renderAdminProducts();

  showToast(
    product.active ? `${product.name} הופעל בחנות` : `${product.name} הוסתר מהחנות`,
    product.active ? '✓' : '○'
  );
}
