// =============================================
// auth.js — אימות מותאם אישית (ללא Supabase Auth)
// סיסמאות מוצפנות עם SHA-256 + salt אישי
// סשן נשמר ב-sessionStorage
// =============================================

let currentUser = null;

// =============================================
// עזר — הצפנה
// =============================================
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================
// סשן
// =============================================
function saveSession(user) {
  sessionStorage.setItem('shopUser', JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem('shopUser');
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem('shopUser');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// =============================================
// אתחול
// =============================================
function initAuth() {
  const saved = loadSession();
  if (saved) setUser(saved);
  else renderNavUser();
}

function setUser(user) {
  currentUser = user;
  if (user) saveSession(user);
  renderNavUser();
}

// =============================================
// ממשק ניווט
// =============================================
function renderNavUser() {
  const btn = document.getElementById('navUserBtn');
  if (!btn) return;
  if (currentUser) {
    btn.innerHTML = `שלום, ${currentUser.first_name} ▾`;
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleUserDropdown();
    };
  } else {
    btn.innerHTML = 'כניסה / הרשמה';
    btn.onclick = () => openAuthModal('login');
    const existing = document.getElementById('userDropdown');
    if (existing) existing.remove();
  }
}

function toggleUserDropdown() {
  let dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.remove();
    return;
  }

  const btn = document.getElementById('navUserBtn');
  dropdown = document.createElement('div');
  dropdown.id = 'userDropdown';
  dropdown.className = 'user-dropdown';
  dropdown.innerHTML = `
    <button class="user-dropdown-item" onclick="showView('history'); document.getElementById('userDropdown')?.remove()">ההזמנות שלי</button>
    <button class="user-dropdown-item user-dropdown-logout" onclick="doLogout()">התנתק</button>
  `;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(dropdown);

  setTimeout(() => {
    document.addEventListener('click', () => dropdown.remove(), { once: true });
  }, 0);
}

// =============================================
// Modal
// =============================================
function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('authModal').classList.add('open');
  setTimeout(() => {
    const el = document.getElementById(tab === 'login' ? 'authLoginEmail' : 'authRegEmail');
    if (el) el.focus();
  }, 50);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthMessages();
}

function switchAuthTab(tab) {
  document.getElementById('authLoginPanel').style.display  = tab === 'login'   ? '' : 'none';
  document.getElementById('authRegPanel').style.display    = tab === 'register' ? '' : 'none';
  document.getElementById('authForgotPanel').style.display = tab === 'forgot'   ? '' : 'none';
  document.querySelectorAll('.auth-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('authForgotSuccess').style.display = 'none';
  if (tab === 'forgot') {
    document.getElementById('authForgotPanel').style.display = '';
  }
  clearAuthMessages();
}

function clearAuthMessages() {
  document.querySelectorAll('.auth-msg').forEach(el => {
    el.textContent = '';
    el.className = 'auth-msg';
  });
}

function showAuthMsg(el, text, type) {
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}

// =============================================
// כניסה
// =============================================
async function doAuthLogin() {
  const email    = document.getElementById('authLoginEmail').value.trim().toLowerCase();
  const password = document.getElementById('authLoginPassword').value;
  const msgEl    = document.getElementById('authLoginMsg');
  const btn      = document.getElementById('authLoginBtn');

  if (!email || !password) { showAuthMsg(msgEl, 'נא למלא מייל וסיסמה', 'error'); return; }

  btn.textContent = '...';
  btn.disabled = true;

  const { data, error } = await db.from('customers')
    .select('id, email, first_name, last_name, phone, password_hash, salt')
    .eq('email', email)
    .single();

  btn.textContent = 'כניסה';
  btn.disabled = false;

  if (error || !data) { showAuthMsg(msgEl, 'פרטי כניסה שגויים', 'error'); return; }

  const hash = await hashPassword(password, data.salt);
  if (hash !== data.password_hash) { showAuthMsg(msgEl, 'פרטי כניסה שגויים', 'error'); return; }

  setUser({ id: data.id, email: data.email, first_name: data.first_name, last_name: data.last_name, phone: data.phone });
  closeAuthModal();
  showToast(`ברוך הבא, ${data.first_name}! 👋`, '✓');
}

// =============================================
// הרשמה
// =============================================
function validateRegPassword() {
  const val = document.getElementById('authRegPassword').value;
  const set = (id, ok) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (ok ? '✓ ' : '✗ ') + el.textContent.slice(2);
    el.style.color  = ok ? 'var(--sage)' : 'var(--text-muted)';
  };
  set('rule-length', val.length >= 8);
  set('rule-letter', /[a-zA-Zאבגדהוזחטיכלמנסעפצקרשת]/.test(val));
  set('rule-number', /[0-9]/.test(val));
}

async function doAuthRegister() {
  const firstName = document.getElementById('authRegFirst').value.trim();
  const lastName  = document.getElementById('authRegLast').value.trim();
  const phone     = document.getElementById('authRegPhone').value.trim();
  const address1  = document.getElementById('authRegAddress1').value.trim();
  const addressApt= document.getElementById('authRegApt').value.trim();
  const city      = document.getElementById('authRegCity').value.trim();
  const zipCode   = document.getElementById('authRegZip').value.trim();
  const email     = document.getElementById('authRegEmail').value.trim().toLowerCase();
  const password        = document.getElementById('authRegPassword').value;
  const passwordConfirm = document.getElementById('authRegPasswordConfirm').value;
  const msgEl           = document.getElementById('authRegMsg');
  const btn             = document.getElementById('authRegBtn');

  if (!firstName) { showAuthMsg(msgEl, 'נא למלא שם פרטי', 'error'); return; }
  if (!lastName)  { showAuthMsg(msgEl, 'נא למלא שם משפחה', 'error'); return; }
  if (!phone)     { showAuthMsg(msgEl, 'נא למלא מספר טלפון', 'error'); return; }
  if (!email)     { showAuthMsg(msgEl, 'נא למלא כתובת מייל', 'error'); return; }

  if (password.length < 8)                              { showAuthMsg(msgEl, 'הסיסמה חייבת להכיל לפחות 8 תווים', 'error'); return; }
  if (!/[a-zA-Zאבגדהוזחטיכלמנסעפצקרשת]/.test(password)) { showAuthMsg(msgEl, 'הסיסמה חייבת להכיל לפחות אות אחת', 'error'); return; }
  if (!/[0-9]/.test(password))                          { showAuthMsg(msgEl, 'הסיסמה חייבת להכיל לפחות ספרה אחת', 'error'); return; }
  if (password !== passwordConfirm)                     { showAuthMsg(msgEl, 'הסיסמאות אינן תואמות', 'error'); return; }

  btn.textContent = '...';
  btn.disabled = true;

  const { data: existing } = await db.from('customers')
    .select('id').eq('email', email).single();

  if (existing) {
    showAuthMsg(msgEl, 'כתובת המייל כבר רשומה', 'error');
    btn.textContent = 'הרשמה';
    btn.disabled = false;
    return;
  }

  const salt         = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const { data, error } = await db.from('customers')
    .insert({
      email, first_name: firstName, last_name: lastName, phone,
      address_line1: address1  || null,
      address_apt:   addressApt || null,
      address_city:          city      || null,
      address_zip:      zipCode   || null,
      password_hash: passwordHash, salt
    })
    .select('id, email, first_name, last_name, phone, address_line1, address_apt, address_city, address_zip')
    .single();

  btn.textContent = 'הרשמה';
  btn.disabled = false;

  if (error) { showAuthMsg(msgEl, 'שגיאה: ' + error.message, 'error'); return; }

  setUser({ id: data.id, email: data.email, first_name: data.first_name, last_name: data.last_name, phone: data.phone, address_line1: data.address_line1, address_apt: data.address_apt, address_city: data.address_city, address_zip: data.address_zip });

  fetch('/.netlify/functions/send-admin-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'new_customer',
      data: { firstName, lastName, email, phone },
    }),
  }).catch(() => {});

  closeAuthModal();
  showToast(`ברוך הבא, ${firstName}! 🎉`, '✓');
}

// =============================================
// איפוס סיסמה
// =============================================
async function doAuthForgot() {
  const email = document.getElementById('authForgotEmail').value.trim().toLowerCase();
  const msgEl = document.getElementById('authForgotMsg');
  const btn   = document.getElementById('authForgotBtn');

  if (!email) { showAuthMsg(msgEl, 'נא למלא כתובת מייל', 'error'); return; }

  btn.textContent = '...';
  btn.disabled = true;

  const { data } = await db.from('customers')
    .select('id, first_name')
    .eq('email', email)
    .single();

  // תמיד מציג הצלחה (לאבטחה — לא חושפים אם המייל קיים)
  if (!data) {
    btn.textContent = 'שלח קישור';
    btn.disabled = false;
    showAuthMsg(msgEl, 'אם המייל קיים במערכת, ישלח אליו קישור לאיפוס סיסמה', 'success');
    return;
  }

  // יצירת טוקן ושמירה בטבלה
  const token     = generateSalt() + generateSalt(); // 64 תווים
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await db.from('password_resets').upsert(
    { customer_id: data.id, token, expires_at: expiresAt },
    { onConflict: 'customer_id' }
  );

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const resetUrl = isLocal
    ? `http://${location.host}/reset-password.html?token=${token}`
    : `https://dooshi.co.il/reset-password.html?token=${token}`;

  if (isLocal) {
    console.log('%c[DEV] Reset URL:', 'color: #C9A84C; font-weight:bold', resetUrl);
  } else {
    try {
      const res = await fetch('/.netlify/functions/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, firstName: data.first_name, resetUrl }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('send-reset-email failed:', res.status, errText);
        btn.textContent = 'שלח קישור';
        btn.disabled = false;
        showAuthMsg(msgEl, 'שגיאה בשליחת המייל. נסה שוב מאוחר יותר.', 'error');
        return;
      }
    } catch (e) {
      console.error('Failed to send reset email:', e);
      btn.textContent = 'שלח קישור';
      btn.disabled = false;
      showAuthMsg(msgEl, 'שגיאה בשליחת המייל. נסה שוב מאוחר יותר.', 'error');
      return;
    }
  }

  btn.textContent = 'שלח קישור';
  btn.disabled = false;
  document.getElementById('authForgotPanel').style.display = 'none';
  document.getElementById('authForgotSuccess').style.display = '';
}

// =============================================
// יציאה
// =============================================
function doLogout() {
  clearSession();
  currentUser = null;
  renderNavUser();
  showToast('התנתקת בהצלחה', '✓');
  showView('shop');
}

// =============================================
// היסטוריית הזמנות
// =============================================
let _historyData = null;
let _historyTab  = 'active';

async function renderOrderHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<div class="history-loading">טוען הזמנות...</div>';

  if (!currentUser) { showView('shop'); return; }

  const { data, error } = await db.from('orders')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('id', { ascending: false });

  _historyData = (!error && data) ? data : [];

  // Reset to active tab whenever we (re)load
  _historyTab = 'active';
  document.querySelectorAll('.history-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === 'active'));

  _renderHistoryTab();
}

function switchHistoryTab(tab, btn) {
  _historyTab = tab;
  document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  _renderHistoryTab();
}

function _renderHistoryTab() {
  const container = document.getElementById('historyList');

  if (!_historyData || !_historyData.length) {
    container.innerHTML = '<div class="history-empty">עדיין אין הזמנות בחשבון שלך</div>';
    return;
  }

  const STATUS = {
    new: 'הזמנה התקבלה', approved: 'אושרה', ready: 'בהכנה',
    pickup: 'מוכן לאיסוף', done: 'הושלם', cancelled: 'בוטלה'
  };

  const groups = {
    active:    _historyData.filter(o => !['done', 'cancelled'].includes(o.status)),
    completed: _historyData.filter(o => o.status === 'done'),
    cancelled: _historyData.filter(o => o.status === 'cancelled'),
  };

  // Update tab badges
  document.querySelectorAll('.history-tab').forEach(t => {
    const count = groups[t.dataset.tab]?.length || 0;
    const base  = { active: 'פעילות', completed: 'הושלמו', cancelled: 'בוטלו' }[t.dataset.tab];
    t.textContent = count ? `${base} (${count})` : base;
    if (t.dataset.tab === _historyTab) t.classList.add('active');
  });

  const orders = groups[_historyTab] || [];

  if (!orders.length) {
    const empty = { active: 'אין הזמנות פעילות', completed: 'אין הזמנות שהושלמו', cancelled: 'אין הזמנות שבוטלו' };
    container.innerHTML = `<div class="history-empty">${empty[_historyTab]}</div>`;
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="history-card">
      <div class="history-card-header">
        <div>
          <span class="history-order-num">#${o.id}</span>
          <span class="history-date">${o.ts}</span>
        </div>
        <div class="history-total">₪${o.total}</div>
      </div>
      <div class="history-items">
        ${o.items.map(i => `
          <div class="history-item">
            <span>${i.product.emoji} ${i.product.name}</span>
            <span class="history-item-right">
              <span class="history-item-qty">× ${i.qty}</span>
              <span class="history-item-price">₪${i.product.price * i.qty}</span>
            </span>
          </div>
        `).join('')}
      </div>
      ${o.pickup_date && o.status !== 'cancelled' ? `
      <div class="history-pickup">
        <span class="history-pickup-label">איסוף</span>
        <span class="history-pickup-date">📅 ${new Date(o.pickup_date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        ${o.pickup_time ? `<span class="history-pickup-time history-pickup-${o.pickup_time}">${o.pickup_time === 'morning' ? '🌅 בוקר' : '🌆 אחה"צ'}</span>` : ''}
      </div>` : ''}
      <div class="history-footer">
        <span class="history-payment">${o.payment === 'cash' ? '💵 מזומן' : '📱 Bit'}</span>
        <span class="status-badge status-${o.status}" style="font-size:0.72rem; padding:2px 8px;">
          ${STATUS[o.status] || o.status}
        </span>
      </div>
      ${o.status === 'new' ? `
      <div class="history-actions">
        <button class="history-action-btn history-edit-btn"   onclick="editOrder(${o.id})">עריכת הזמנה</button>
        <button class="history-action-btn history-cancel-btn" onclick="cancelOrder(${o.id})">ביטול הזמנה</button>
      </div>` : ''}
    </div>`).join('');
}

// =============================================
// ביטול הזמנה
// =============================================
async function cancelOrder(orderId) {
  if (!confirm('לבטל את ההזמנה?')) return;
  const { error } = await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
  if (error) { showToast('שגיאה בביטול ההזמנה', '❌'); return; }
  showToast('ההזמנה בוטלה', '✓');
  await renderOrderHistory();
}

// =============================================
// עריכת הזמנה
// =============================================
async function editOrder(orderId) {
  const { data: o, error } = await db.from('orders').select('*').eq('id', orderId).single();
  if (error || !o) { showToast('שגיאה בטעינת ההזמנה', '❌'); return; }
  if (o.status !== 'new') { showToast('לא ניתן לערוך הזמנה שאושרה', '⚠️'); await renderOrderHistory(); return; }

  // Restore cart from stored item names → current product IDs
  cart = {};
  o.items.forEach(i => {
    const p = products.find(p => p.name === i.product.name);
    if (p) cart[p.id] = i.qty;
  });
  updateCartUI();
  Object.keys(cart).forEach(id => syncCardFooter(id));

  // Store order details so goToOrder() can pre-fill the form
  editingOrderId   = orderId;
  editingOrderData = {
    name:        o.name        || '',
    phone:       o.phone       || '',
    payment:     o.payment     || 'cash',
    notes:       o.notes       || '',
    pickup_date: o.pickup_date || '',
    pickup_time: o.pickup_time || '',
  };

  // Go to shop so the user can browse and modify the cart freely
  showView('shop');
  showToast(`עורכים הזמנה #${orderId} — שנו את הסל ולחצו לתשלום`, '✏️');

  // Open cart drawer so user immediately sees the restored items
  const drawer  = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer && !drawer.classList.contains('open')) {
    drawer.classList.add('open');
    overlay.classList.add('open');
  }
}
