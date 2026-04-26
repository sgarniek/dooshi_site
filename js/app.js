// ════════════════════════════════════════════
// js/app.js — לוגיקה ראשית של Dooshi
// ════════════════════════════════════════════
//
// מבנה הקובץ:
//  1. DATA       — מוצרים, הזמנות, מצב עגלה
//  2. VIEWS      — ניהול מעבר בין דפים
//  3. PRODUCTS   — רינדור ופילטור מוצרים
//  4. CART       — לוגיקת עגלת קניות
//  5. ORDER FORM — טופס הגשת הזמנה
//  6. ADMIN      — לוח ניהול
//  7. SMS MODAL  — חלון שליחת הודעה
//  8. TOAST      — הודעות קצרות
//  9. INIT       — אתחול ראשוני
// ════════════════════════════════════════════


// ── 1. DATA ──────────────────────────────────

/**
 * רשימת המוצרים.
 * כדי להוסיף מוצר: העתיקו אובייקט, שנו id (ייחודי) ואת שאר השדות.
 * type: 'cookie' | 'muffin'
 */
const products = [
  { id: 1, name: "עוגיית שוקולד צ'יפס", desc: 'קלאסיקה ביתית עם שוקולד בלגי איכותי',        price: 8,  emoji: '🍪', type: 'cookie', active: true },
  { id: 2, name: 'עוגיית לוטוס',         desc: 'עם ממרח לוטוס ושבבי ביסקוויט',               price: 9,  emoji: '🍪', type: 'cookie', active: true },
  { id: 3, name: "עוגיית M&M's",         desc: 'צבעונית, שמחה ומלאה בחתיכות שוקולד',        price: 9,  emoji: '🍪', type: 'cookie', active: true },
  { id: 4, name: 'עוגיית לבן שחור',      desc: 'שוקולד לבן ושוקולד מריר בעוגייה אחת',        price: 9,  emoji: '🍪', type: 'cookie', active: true },
  { id: 5, name: 'מאפין שוקולד',         desc: 'מאפין עשיר ולח עם ליבת שוקולד נוזלית',       price: 12, emoji: '🧁', type: 'muffin', active: true },
  { id: 6, name: 'מאפין בלוברי',         desc: 'עם אוכמניות טריות ועיטור סוכר גבישי',        price: 12, emoji: '🧁', type: 'muffin', active: true },
  { id: 7, name: 'מאפין לוטוס',          desc: 'מאפין וניל עם שכבת לוטוס ואגוזים',           price: 13, emoji: '🧁', type: 'muffin', active: true },
  { id: 8, name: 'עוגיית שיבולת שועל',   desc: 'בריאה ומתוקה עם צימוקים ואגוזים',            price: 8,  emoji: '🍪', type: 'cookie', active: true },
];

/** הזמנות — בפרודקשן יגיעו מ-database */
let orders = [];

/** מצב העגלה: { [productId]: quantity } */
let cart = {};

/** מונה הזמנות — יתחיל מ-1001 */
let orderCounter = 1000;

/** סיסמת לוח הניהול — שנו לפי הצורך */
const adminPassword = 'dooshi123';

/** פעולת SMS ממתינה לאישור */
let currentSMSAction = null;

/** פילטר מוצרים פעיל */
let activeFilter = 'all';

/** מיפוי סטטוסים לעברית */
const statusLabels   = { new: 'חדשה', approved: 'מאושרת', ready: 'מוכנה', done: 'הושלמה' };
const statusClasses  = { new: 'status-new', approved: 'status-approved', ready: 'status-ready', done: 'status-done' };


// ── 2. VIEWS ─────────────────────────────────

/**
 * מעבר בין דפים.
 * @param {string} v  - שם ה-view: 'shop' | 'order' | 'success' | 'admin'
 */
function showView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  window.scrollTo(0, 0);
}

/**
 * כניסה לניהול עם בדיקת סיסמה.
 * שנו את adminPassword למעלה לסיסמה חזקה יותר בפרודקשן.
 */
function showAdmin() {
  const pw = prompt('סיסמת ניהול:');
  if (pw === adminPassword) {
    showView('admin');
    renderAdmin();
  } else if (pw !== null) {
    toast('סיסמה שגויה', '❌');
  }
}


// ── 3. PRODUCTS ──────────────────────────────

/** מרנדר את גריד המוצרים לפי הפילטר הפעיל */
function renderProducts() {
  const grid   = document.getElementById('productsGrid');
  const active = products.filter(p => p.active);
  const list   = activeFilter === 'all' ? active : active.filter(p => p.type === activeFilter);

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">אין מוצרים זמינים כרגע</div>';
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="product-card">
      <div class="product-img">
        <span style="font-size:4rem">${p.emoji}</span>
      </div>
      <div class="product-info">
        <span class="product-badge ${p.type === 'cookie' ? 'badge-cookie' : 'badge-muffin'}">
          ${p.type === 'cookie' ? 'עוגייה' : 'מאפין'}
        </span>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.desc}</div>
        <div class="product-footer">
          <span class="product-price">₪${p.price}</span>
          <button class="add-btn" onclick="addToCart(${p.id})" title="הוסף לעגלה">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * פילטור מוצרים.
 * @param {string} type - 'all' | 'cookie' | 'muffin'
 * @param {HTMLElement} el - הכפתור שנלחץ (לעדכון .active)
 */
function filterProducts(type, el) {
  activeFilter = type;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderProducts();
}


// ── 4. CART ──────────────────────────────────

/**
 * הוספת מוצר לעגלה.
 * @param {number} id - מזהה המוצר
 */
function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  updateCartUI();
  toast('נוסף לעגלה!', '🛒');
}

/** מחשב ומרנדר את כל ממשק העגלה */
function updateCartUI() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => s + (products.find(p => p.id == id)?.price || 0) * q, 0);
  const count = items.reduce((s, [, q]) => s + q, 0);

  // עדכון badge בכפתור
  const badge = document.getElementById('cartBadge');
  badge.style.display = count > 0 ? 'flex' : 'none';
  badge.textContent   = count;

  const body   = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');

  // עגלה ריקה
  if (!items.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🍪</div>
        <div>העגלה ריקה</div>
        <div style="font-size:0.8rem; margin-top:6px; color:var(--text-muted)">הוסיפו מוצרים מהחנות</div>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  // פריטים
  body.innerHTML = items.map(([id, q]) => {
    const p = products.find(x => x.id == id);
    return `
      <div class="cart-item">
        <div class="cart-item-emoji">${p.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-price">₪${p.price} ליחידה</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${id}, -1)">−</button>
          <span class="qty-num">${q}</span>
          <button class="qty-btn" onclick="changeQty(${id}, 1)">+</button>
        </div>
      </div>`;
  }).join('');

  footer.style.display = 'block';
  document.getElementById('cartTotal').textContent = '₪' + total;
}

/**
 * שינוי כמות בעגלה.
 * @param {number} id    - מזהה מוצר
 * @param {number} delta - +1 או -1
 */
function changeQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  if (!cart[id]) delete cart[id];
  updateCartUI();
}

/** פתיחה/סגירה של drawer העגלה */
function toggleCart() {
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}

/** מעבר לדף הזמנה */
function goToOrder() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  if (!items.length) { toast('העגלה ריקה', '⚠️'); return; }
  toggleCart();
  renderOrderSummary();
  showView('order');
}


// ── 5. ORDER FORM ────────────────────────────

/** ממלא את תיבת הסיכום בדף ההזמנה */
function renderOrderSummary() {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => s + (products.find(p => p.id == id)?.price || 0) * q, 0);

  document.getElementById('orderSummaryLines').innerHTML = items.map(([id, q]) => {
    const p = products.find(x => x.id == id);
    return `<div class="order-line"><span>${p.emoji} ${p.name} × ${q}</span><span>₪${p.price * q}</span></div>`;
  }).join('');

  document.getElementById('orderSummaryTotal').textContent = '₪' + total;
}

/**
 * בחירת אמצעי תשלום.
 * @param {HTMLElement} el  - האלמנט שנלחץ
 * @param {string} val      - 'cash' | 'bit'
 */
function selectPayment(el, val) {
  document.querySelectorAll('.pickup-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('fPayment').value = val;
}

/** שליחת הזמנה — ולידציה + יצירת אובייקט הזמנה */
function submitOrder() {
  const name    = (document.getElementById('fName').value + ' ' + document.getElementById('fLast').value).trim();
  const phone   = document.getElementById('fPhone').value.trim();
  const payment = document.getElementById('fPayment').value;
  const notes   = document.getElementById('fNotes').value.trim();

  // ולידציה בסיסית
  if (!name || name.length < 2) { toast('נא למלא שם', '⚠️'); return; }
  if (!phone)                    { toast('נא למלא טלפון', '⚠️'); return; }

  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ id: parseInt(id), qty: q, product: products.find(p => p.id == id) }));

  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);

  orderCounter++;
  const order = {
    num:         orderCounter,
    name, phone, payment, notes, items, total,
    status:      'new',
    ts:          new Date().toLocaleString('he-IL'),
    smsApproved: false,
    smsReady:    false,
  };

  orders.unshift(order); // הוסף בראש הרשימה
  cart = {};             // רוקן עגלה
  updateCartUI();

  document.getElementById('successOrderNum').textContent = '#' + orderCounter;
  showView('success');
}


// ── 6. ADMIN ─────────────────────────────────

/**
 * מעבר בין טאבי ניהול (הזמנות / מוצרים).
 * @param {string} tab  - 'orders' | 'products'
 * @param {HTMLElement} el
 */
function switchAdminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('atab-' + tab).classList.add('active');
}

/** מרנדר את כל לוח הניהול */
function renderAdmin() {
  renderAdminStats();
  renderOrdersTable();
  renderAdminProducts();
}

/** כרטיסי סטטיסטיקה בראש לוח הניהול */
function renderAdminStats() {
  const total = orders.reduce((s, o) => s + o.total, 0);
  const pending = orders.filter(o => o.status === 'new').length;
  const approved = orders.filter(o => o.status === 'approved').length;

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">סה"כ הזמנות</div><div class="stat-val">${orders.length}</div></div>
    <div class="stat-card"><div class="stat-label">ממתינות לאישור</div><div class="stat-val">${pending}</div></div>
    <div class="stat-card"><div class="stat-label">מאושרות / בהכנה</div><div class="stat-val">${approved}</div></div>
    <div class="stat-card"><div class="stat-label">מחזור כולל (₪)</div><div class="stat-val">₪${total}</div></div>
  `;
}

/** טבלת הזמנות */
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  const empty = document.getElementById('ordersEmpty');

  if (!orders.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>
        <strong>#${o.num}</strong>
        <br><span style="font-size:0.75rem; color:var(--text-muted)">${o.ts}</span>
      </td>
      <td>${o.name}</td>
      <td dir="ltr">${o.phone}</td>
      <td>
        <div class="order-items-list">
          ${o.items.map(i => `${i.product.emoji} ${i.product.name} ×${i.qty}`).join('<br>')}
        </div>
      </td>
      <td><strong>₪${o.total}</strong></td>
      <td>${o.payment === 'cash' ? '💵 מזומן' : '📱 Bit'}</td>
      <td>
        <span class="status-badge ${statusClasses[o.status]}">
          <span class="status-dot"></span>${statusLabels[o.status]}
        </span>
        ${o.smsApproved ? '<div class="sms-sent-badge">✓ SMS אישור נשלח</div>' : ''}
        ${o.smsReady    ? '<div class="sms-sent-badge">✓ SMS מוכן נשלח</div>'  : ''}
      </td>
      <td>
        <div class="action-btns">
          ${o.status === 'new'      ? `<button class="btn btn-primary btn-sm" onclick="approveOrder(${o.num})">אשר הזמנה</button>` : ''}
          ${o.status === 'approved' ? `<button class="btn btn-caramel btn-sm" onclick="markReady(${o.num})">סמן כמוכן</button>`   : ''}
          ${o.status === 'ready'    ? `<button class="btn btn-success btn-sm" onclick="markDone(${o.num})">נמסר ✓</button>`       : ''}
          ${!o.smsApproved && o.status !== 'new'              ? `<button class="btn btn-ghost btn-sm" onclick="openSMS(${o.num}, 'approved')">SMS אישור</button>` : ''}
          ${o.status === 'ready' && !o.smsReady               ? `<button class="btn btn-ghost btn-sm" onclick="openSMS(${o.num}, 'ready')">SMS מוכן</button>`   : ''}
        </div>
        ${o.notes ? `<div class="admin-order-detail">📝 ${o.notes}</div>` : ''}
      </td>
    </tr>
  `).join('');
}

/**
 * אישור הזמנה → מעדכן סטטוס ל-approved ופותח SMS.
 * @param {number} num - מספר הזמנה
 */
function approveOrder(num) {
  const o = orders.find(x => x.num === num);
  if (!o) return;
  o.status = 'approved';
  openSMS(num, 'approved');
}

/**
 * סימון הזמנה כמוכנה.
 * @param {number} num
 */
function markReady(num) {
  const o = orders.find(x => x.num === num);
  if (!o) return;
  o.status = 'ready';
  openSMS(num, 'ready');
}

/**
 * סימון הזמנה כנמסרה.
 * @param {number} num
 */
function markDone(num) {
  const o = orders.find(x => x.num === num);
  if (!o) return;
  o.status = 'done';
  renderAdmin();
  toast('ההזמנה סומנה כנמסרה', '✓');
}

/** גריד ניהול מוצרים עם מתגי הפעלה */
function renderAdminProducts() {
  document.getElementById('adminProductsGrid').innerHTML = products.map(p => `
    <div class="product-admin-card">
      <div class="product-admin-emoji">${p.emoji}</div>
      <div class="product-admin-info" style="flex:1">
        <div class="product-admin-name">${p.name}</div>
        <div class="product-admin-price">₪${p.price} • ${p.type === 'cookie' ? 'עוגייה' : 'מאפין'}</div>
      </div>
      <label class="toggle-switch" title="${p.active ? 'פעיל — לחץ לכיבוי' : 'כבוי — לחץ להפעלה'}">
        <input type="checkbox" ${p.active ? 'checked' : ''} onchange="toggleProduct(${p.id})" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');
}

/**
 * הפעלה/כיבוי של מוצר.
 * @param {number} id
 */
function toggleProduct(id) {
  const p = products.find(x => x.id === id);
  if (p) p.active = !p.active;
  renderProducts();  // עדכן גם את החנות
  toast(p.active ? `${p.name} הופעל` : `${p.name} הושבת`, p.active ? '✓' : '○');
}


// ── 7. SMS MODAL ─────────────────────────────

/**
 * פתיחת חלון אישור SMS.
 * @param {number} num   - מספר הזמנה
 * @param {string} type  - 'approved' | 'ready'
 *
 * כדי לחבר לשירות SMS אמיתי (כגון Twilio, 019, MessageBird):
 *  1. במקום הסימולציה ב-confirmSMS(), שלחו fetch/axios ל-backend שלכם.
 *  2. ה-backend יקרא ל-API של ספק ה-SMS עם הטלפון והטקסט.
 */
function openSMS(num, type) {
  const o = orders.find(x => x.num === num);
  if (!o) return;

  currentSMSAction = { num, type };

  const itemsText = o.items.map(i => `${i.product.name} ×${i.qty}`).join(', ');
  let msg, title, desc;

  if (type === 'approved') {
    title = 'שלח SMS — אישור הזמנה';
    desc  = `ההודעה תישלח ל-${o.phone}`;
    msg   = `שלום ${o.name} 😊\nההזמנה שלך מ-Dooshi אושרה! 🍪\n\nמס׳ הזמנה: #${o.num}\n${itemsText}\n\nנעדכן אותך כשהכל מוכן לאיסוף 🤍\nDooshi – Homemade in Tel Aviv`;
  } else {
    title = 'שלח SMS — הזמנה מוכנה לאיסוף';
    desc  = `ההודעה תישלח ל-${o.phone}`;
    msg   = `שלום ${o.name} 🎉\nההזמנה שלך מוכנה לאיסוף!\n\nמס׳ הזמנה: #${o.num}\n${itemsText}\nסה"כ: ₪${o.total}\nתשלום: ${o.payment === 'cash' ? 'מזומן' : 'Bit'}\n\nDooshi 🍪 – Homemade in Tel Aviv`;
  }

  document.getElementById('smsModalTitle').textContent = title;
  document.getElementById('smsModalDesc').textContent  = desc;
  document.getElementById('smsPreview').textContent    = msg;
  document.getElementById('smsModal').classList.add('open');
}

/**
 * אישור שליחת SMS — כרגע סימולציה.
 * החליפו את הגוף בקריאה אמיתית ל-API.
 */
function confirmSMS() {
  if (!currentSMSAction) return;
  const { num, type } = currentSMSAction;
  const o = orders.find(x => x.num === num);

  if (o) {
    // ── כאן תוסיפו קריאה ל-backend לשליחת SMS אמיתי ──
    // await fetch('/api/send-sms', { method: 'POST', body: JSON.stringify({ phone: o.phone, message: ... }) })

    if (type === 'approved') o.smsApproved = true;
    else                     o.smsReady    = true;
  }

  closeModal();
  renderAdmin();
  toast('SMS נשלח בהצלחה!', '📱');
}

/** סגירת מודל ה-SMS */
function closeModal() {
  document.getElementById('smsModal').classList.remove('open');
  currentSMSAction = null;
}


// ── 8. TOAST ─────────────────────────────────

let toastTimer;

/**
 * הצגת הודעה קצרה בתחתית המסך.
 * @param {string} msg  - הטקסט
 * @param {string} icon - אימוג'י אופציונלי
 */
function toast(msg, icon = '') {
  const el = document.getElementById('toast');
  el.textContent = (icon ? icon + ' ' : '') + msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}


// ── 9. INIT ──────────────────────────────────

// הזמנת דמו לתצוגת לוח הניהול בפיתוח — מחקו בפרודקשן
orders.push({
  num:         1001,
  name:        'מיכל כהן',
  phone:       '054-1234567',
  payment:     'bit',
  notes:       'ללא אגוזים בבקשה',
  items:       [
    { id: 1, qty: 6, product: products[0] },
    { id: 5, qty: 2, product: products[4] },
  ],
  total:       72,
  status:      'new',
  ts:          new Date().toLocaleString('he-IL'),
  smsApproved: false,
  smsReady:    false,
});

// אתחול ראשוני
renderProducts();
updateCartUI();
