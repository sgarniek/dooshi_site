// =============================================
// order.js — טופס הזמנה ושליחה
// =============================================

let pickupSlots        = [];
let calendarYear       = null;
let calendarMonth      = null;
let selectedPickupDate = '';
let editingOrderId     = null;
let editingOrderData   = null;

// =============================================
// טעינת תאריכי איסוף
// =============================================
async function loadPickupSlots() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await db.from('pickup_slots')
    .select('*')
    .gte('slot_date', today)
    .or('morning.eq.true,afternoon.eq.true')
    .order('slot_date');
  pickupSlots = data || [];

  // קפיצה לחודש הראשון שיש בו תאריך זמין
  const now = new Date();
  calendarYear  = now.getFullYear();
  calendarMonth = now.getMonth();
  if (pickupSlots.length) {
    const first = new Date(pickupSlots[0].slot_date + 'T00:00:00');
    calendarYear  = first.getFullYear();
    calendarMonth = first.getMonth();
  }
  selectedPickupDate = '';
  document.getElementById('fPickupDate').value = '';
  document.getElementById('fPickupTime').value = '';
  document.getElementById('fPickupTimeGroup').style.display = 'none';

  renderPickupCalendar();
}

// =============================================
// רינדור לוח שנה
// =============================================
function renderPickupCalendar() {
  const today      = new Date().toISOString().split('T')[0];
  const slotMap    = {};
  pickupSlots.forEach(s => { slotMap[s.slot_date] = s; });

  const firstDay   = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const startDow   = firstDay.getDay(); // 0 = ראשון

  // כותרת חודש
  document.getElementById('calendarMonthLabel').textContent =
    firstDay.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  // כותרות ימים
  const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
  let html = '<div class="cal-headers">';
  dayNames.forEach(d => { html += `<div class="cal-header-cell">${d}</div>`; });
  html += '</div><div class="cal-days">';

  // תאים ריקים לפני היום הראשון
  for (let i = 0; i < startDow; i++) html += '<div class="cal-day cal-empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const mm      = String(calendarMonth + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${calendarYear}-${mm}-${dd}`;
    const slot    = slotMap[dateStr];
    const isPast  = dateStr < today;
    const isAvail = !!slot && !isPast;
    const isSel   = dateStr === selectedPickupDate;

    let cls = 'cal-day';
    if (isSel)        cls += ' cal-selected';
    else if (isAvail) cls += ' cal-available';
    else              cls += ' cal-dim';

    let dots = '';
    if (isAvail) {
      if (slot.morning)   dots += '<span class="cal-dot cal-dot-morning"></span>';
      if (slot.afternoon) dots += '<span class="cal-dot cal-dot-afternoon"></span>';
    }

    const click = isAvail ? `onclick="selectCalendarDate('${dateStr}')"` : '';
    html += `<div class="${cls}" ${click}><span class="cal-day-num">${d}</span><div class="cal-dots">${dots}</div></div>`;
  }

  html += '</div>';

  if (!pickupSlots.length) {
    html = '<div class="cal-no-slots">אין תאריכי איסוף זמינים כרגע</div>';
  }

  document.getElementById('calendarGrid').innerHTML = html;
}

function prevCalendarMonth() {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderPickupCalendar();
}

function nextCalendarMonth() {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderPickupCalendar();
}

function selectCalendarDate(dateStr) {
  selectedPickupDate = dateStr;
  document.getElementById('fPickupDate').value = dateStr;
  renderPickupCalendar();

  const slot      = pickupSlots.find(s => s.slot_date === dateStr);
  const timeGroup = document.getElementById('fPickupTimeGroup');
  const timeOpts  = document.getElementById('fPickupTimeOpts');
  const timeInput = document.getElementById('fPickupTime');

  let html = '';
  if (slot.morning)   html += `<div class="pickup-opt" onclick="selectPickupTime(this, 'morning')">🌅 בוקר</div>`;
  if (slot.afternoon) html += `<div class="pickup-opt" onclick="selectPickupTime(this, 'afternoon')">🌆 אחה"צ</div>`;

  timeOpts.innerHTML = html;
  timeInput.value    = '';
  timeGroup.style.display = '';

  // בחירה אוטומטית אם יש רק אפשרות אחת
  if (slot.morning !== slot.afternoon) {
    const val = slot.morning ? 'morning' : 'afternoon';
    selectPickupTime(timeOpts.querySelector('.pickup-opt'), val);
  }
}

function selectPickupTime(el, value) {
  document.querySelectorAll('#fPickupTimeOpts .pickup-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('fPickupTime').value = value;
}

// Pre-select a date+time (used when editing an existing order)
function prefillPickupSelection(date, time) {
  const slot = pickupSlots.find(s => s.slot_date === date);
  if (!slot) return;
  selectCalendarDate(date);
  // Override the auto-selection with the stored time
  const btn = Array.from(document.querySelectorAll('#fPickupTimeOpts .pickup-opt'))
    .find(o => o.getAttribute('onclick')?.includes(time));
  if (btn) selectPickupTime(btn, time);
}

function clearEditMode() {
  editingOrderId   = null;
  editingOrderData = null;
  document.getElementById('orderFormTitle').textContent    = 'סיום הזמנה';
  document.getElementById('orderFormSubtitle').textContent = 'מלאו את הפרטים ונאשר את ההזמנה בהקדם';
}

function leaveOrderForm() {
  if (editingOrderId) {
    // Back to shop so user can keep browsing; clear edit state
    clearEditMode();
    cart = {};
    updateCartUI();
  }
  showView('shop');
}

// =============================================
// סיכום הזמנה
// =============================================
function renderOrderSummary() {
  const items = Object.entries(cart).filter(([, qty]) => qty > 0);
  const total = items.reduce((sum, [id, qty]) => {
    const p = products.find(p => p.id == id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  document.getElementById('orderSummaryLines').innerHTML = items.map(([id, qty]) => {
    const p = products.find(p => p.id == id);
    if (!p) return '';
    return `<div class="order-line"><span>${p.emoji} ${p.name} × ${qty}</span><span>₪${p.price * qty}</span></div>`;
  }).join('');

  document.getElementById('orderSummaryTotal').textContent = '₪' + total;
}

// =============================================
// בחירת אמצעי תשלום
// =============================================
function selectPayment(clickedEl, value) {
  document.querySelectorAll('.pickup-opts .pickup-opt').forEach(el => el.classList.remove('selected'));
  clickedEl.classList.add('selected');
  document.getElementById('fPayment').value = value;
}

// =============================================
// שליחת ההזמנה
// =============================================
async function submitOrder() {
  const firstName  = document.getElementById('fName').value.trim();
  const lastName   = document.getElementById('fLast').value.trim();
  const phone      = document.getElementById('fPhone').value.trim();
  const payment    = document.getElementById('fPayment').value;
  const notes      = document.getElementById('fNotes').value.trim();
  const pickupDate = document.getElementById('fPickupDate').value;
  const pickupTime = document.getElementById('fPickupTime').value;

  const fullName = (firstName + ' ' + lastName).trim();

  if (!firstName)  { showToast('נא למלא שם פרטי', '⚠️');      document.getElementById('fName').focus();        return; }
  if (!phone)      { showToast('נא למלא מספר טלפון', '⚠️');    document.getElementById('fPhone').focus();       return; }
  if (!pickupDate) { showToast('נא לבחור תאריך איסוף', '⚠️');                                                   return; }
  if (!pickupTime) { showToast('נא לבחור שעת איסוף', '⚠️');                                                     return; }

  const items = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id: parseInt(id), qty, product: products.find(p => p.id == id) }));

  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const ts    = new Date().toLocaleString('he-IL');

  const orderPayload = {
    name:        fullName,
    phone,
    payment,
    items:       items.map(i => ({ qty: i.qty, product: { name: i.product.name, emoji: i.product.emoji, price: i.product.price } })),
    total,
    notes:       notes || null,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
  };

  // =============================================
  // עדכון הזמנה קיימת
  // =============================================
  if (editingOrderId) {
    const { error } = await db.from('orders').update(orderPayload).eq('id', editingOrderId);
    if (error) { console.error('Supabase error:', error); showToast('שגיאה בעדכון ההזמנה, נסה שוב', '❌'); return; }

    clearEditMode();
    cart = {};
    updateCartUI();
    resetOrderForm();
    showToast('ההזמנה עודכנה בהצלחה ✓', '✅');
    await renderOrderHistory();
    showView('history');
    return;
  }

  // =============================================
  // הזמנה חדשה
  // =============================================
  const { data: inserted, error } = await db.from('orders').insert({
    ...orderPayload,
    status:  'new',
    ts,
    user_id: currentUser?.id ?? null,
  }).select('id').single();

  if (error) { console.error('Supabase error:', error); showToast('שגיאה בשמירת ההזמנה, נסה שוב', '❌'); return; }

  const orderId = inserted.id;
  orders.unshift({ id: orderId, name: fullName, phone, payment, notes, items, total, status: 'new', ts, pickup_date: pickupDate, pickup_time: pickupTime, smsApproved: false, smsReady: false });

  const formData = new FormData();
  formData.append('form-name', 'dooshi-order');
  formData.append('name',    fullName);
  formData.append('phone',   phone);
  formData.append('payment', payment === 'cash' ? 'מזומן' : 'Bit');
  formData.append('items',   items.map(i => `${i.product.name} ×${i.qty}`).join(', '));
  formData.append('total',   '₪' + total);
  formData.append('notes',   notes || '—');
  fetch('/', { method: 'POST', body: formData }).catch(() => {});

  resetOrderForm();
  document.getElementById('successOrderNum').textContent = '#' + orderId;
  showView('success');
}

function resetOrderForm() {
  cart = {};
  updateCartUI();
  ['fName', 'fLast', 'fPhone', 'fNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fPayment').value = 'cash';
  document.getElementById('fPickupDate').value = '';
  document.getElementById('fPickupTime').value = '';
  document.getElementById('fPickupTimeGroup').style.display = 'none';
  selectedPickupDate = '';
  document.querySelectorAll('#orderForm .pickup-opt').forEach((el, i) => el.classList.toggle('selected', i === 0));
}
