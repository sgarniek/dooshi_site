// =============================================
// order.js — טופס הזמנה ושליחה
// =============================================

let pickupSlots        = [];
let calendarYear       = null;
let calendarMonth      = null;
let selectedPickupDate = '';
let editingOrderId     = null;
let editingOrderData   = null;
let appliedCoupon      = null;
let appliedDiscount    = 0;

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
  const subtotal = items.reduce((sum, [id, qty]) => {
    const p = products.find(p => p.id == id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  document.getElementById('orderSummaryLines').innerHTML = items.map(([id, qty]) => {
    const p = products.find(p => p.id == id);
    if (!p) return '';
    return `<div class="order-line"><span>${p.emoji} ${p.name} × ${qty}</span><span>₪${p.price * qty}</span></div>`;
  }).join('');

  const discountLine = document.getElementById('orderDiscountLine');
  if (appliedCoupon && appliedDiscount > 0) {
    discountLine.style.display = '';
    document.getElementById('orderDiscountLabel').textContent = `קופון ${appliedCoupon.code}`;
    document.getElementById('orderDiscountAmount').textContent = `-₪${appliedDiscount}`;
  } else {
    discountLine.style.display = 'none';
  }

  document.getElementById('orderSummaryTotal').textContent = '₪' + Math.max(0, subtotal - appliedDiscount);
}

function revalidateCoupon() {
  if (!appliedCoupon) return;

  const items    = Object.entries(cart).filter(([, qty]) => qty > 0);
  const subtotal = items.reduce((sum, [id, qty]) => {
    const p = products.find(p => p.id == id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const msgEl = document.getElementById('couponMsg');

  if (subtotal < appliedCoupon.min_order_amount) {
    appliedDiscount = 0;
    if (msgEl) {
      msgEl.textContent = `סכום ההזמנה נמוך מהמינימום הנדרש (₪${appliedCoupon.min_order_amount}) — הקופון לא יחול`;
      msgEl.style.color = 'var(--rose)';
    }
  } else {
    let discount = appliedCoupon.type === 'fixed'
      ? Math.min(appliedCoupon.value, subtotal)
      : subtotal * (appliedCoupon.value / 100);
    if (appliedCoupon.type === 'percentage' && appliedCoupon.max_discount) {
      discount = Math.min(discount, appliedCoupon.max_discount);
    }
    appliedDiscount = Math.round(discount * 100) / 100;
    if (msgEl) {
      msgEl.textContent = `קופון הוחל! חיסכון: ₪${appliedDiscount}`;
      msgEl.style.color = 'var(--sage)';
    }
  }

  renderOrderSummary();
}

async function applyCoupon() {
  const code = document.getElementById('fCouponCode').value.trim().toUpperCase();
  const msgEl = document.getElementById('couponMsg');

  const showMsg = (text, color) => { msgEl.textContent = text; msgEl.style.color = color; };

  if (!code) { showMsg('נא להזין קוד קופון', 'var(--rose)'); return; }

  const items    = Object.entries(cart).filter(([, qty]) => qty > 0);
  const subtotal = items.reduce((sum, [id, qty]) => {
    const p = products.find(p => p.id == id);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const { data: coupon } = await db.from('coupons')
    .select('*').eq('code', code).eq('active', true).single();

  if (!coupon) { showMsg('קוד קופון לא תקין', 'var(--rose)'); return; }

  if (coupon.expires_at && new Date(coupon.expires_at + 'T23:59:59') < new Date()) {
    showMsg('קוד קופון פג תוקף', 'var(--rose)'); return;
  }

  if (coupon.allowed_user_ids && !coupon.allowed_user_ids.includes(currentUser.id)) {
    showMsg('קוד קופון אינו תקף עבורך', 'var(--rose)'); return;
  }

  if (subtotal < coupon.min_order_amount) {
    showMsg(`מינימום הזמנה ₪${coupon.min_order_amount} לשימוש בקופון`, 'var(--rose)'); return;
  }

  const { count } = await db.from('coupon_usages')
    .select('*', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id)
    .eq('customer_id', currentUser.id);

  if (count >= coupon.max_usages_per_user) {
    showMsg('הגעת למגבלת השימוש בקופון זה', 'var(--rose)'); return;
  }

  let discount = coupon.type === 'fixed'
    ? Math.min(coupon.value, subtotal)
    : subtotal * (coupon.value / 100);
  if (coupon.type === 'percentage' && coupon.max_discount) {
    discount = Math.min(discount, coupon.max_discount);
  }
  discount = Math.round(discount * 100) / 100;

  appliedCoupon   = coupon;
  appliedDiscount = discount;

  document.getElementById('fCouponCode').disabled = true;
  document.getElementById('couponRemoveBtn').style.display = '';
  showMsg(`קופון הוחל! חיסכון: ₪${discount}`, 'var(--sage)');
  renderOrderSummary();
}

function removeCoupon() {
  appliedCoupon   = null;
  appliedDiscount = 0;
  document.getElementById('fCouponCode').value    = '';
  document.getElementById('fCouponCode').disabled = false;
  document.getElementById('couponRemoveBtn').style.display = 'none';
  document.getElementById('couponMsg').textContent = '';
  renderOrderSummary();
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

  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const total    = Math.max(0, subtotal - appliedDiscount);
  const ts       = new Date().toLocaleString('he-IL');

  const orderPayload = {
    name:            fullName,
    phone,
    payment,
    items:           items.map(i => ({ qty: i.qty, product: { name: i.product.name, emoji: i.product.emoji, price: i.product.price } })),
    total,
    notes:           notes || null,
    pickup_date:     pickupDate,
    pickup_time:     pickupTime,
    coupon_id:       appliedCoupon?.id ?? null,
    discount_amount: appliedDiscount || 0,
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

    fetch('/.netlify/functions/send-admin-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'order_modified',
        data: { orderId: editingOrderId, name: fullName, phone, total, payment, pickupDate },
      }),
    }).catch(() => {});

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

  if (appliedCoupon && currentUser) {
    await db.from('coupon_usages').insert({
      coupon_id:   appliedCoupon.id,
      customer_id: currentUser.id,
      order_id:    orderId,
    });
  }

  fetch('/.netlify/functions/send-admin-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'new_order',
      data: { orderId, name: fullName, phone, total, payment, pickupDate },
    }),
  }).catch(() => {});
  orders.unshift({ id: orderId, name: fullName, phone, payment, notes, items, total, status: 'new', ts, pickup_date: pickupDate, pickup_time: pickupTime, smsApproved: false, smsReady: false });

  const formData = new FormData();
  formData.append('form-name', 'dooshi-order');
  formData.append('name',    fullName);
  formData.append('phone',   phone);
  formData.append('payment', payment === 'cash' ? 'מזומן' : 'Bit');
  formData.append('items',   items.map(i => `${i.product.name} ×${i.qty}`).join(', '));
  formData.append('total',   '₪' + total);
  formData.append('notes',   notes || '—');
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isLocal) fetch('/', { method: 'POST', body: formData }).catch(() => {});

  resetOrderForm();
  document.getElementById('successOrderNum').textContent = '#' + orderId;
  showView('success');
}

function resetOrderForm() {
  appliedCoupon   = null;
  appliedDiscount = 0;
  const couponCode = document.getElementById('fCouponCode');
  if (couponCode) { couponCode.value = ''; couponCode.disabled = false; }
  const couponMsg = document.getElementById('couponMsg');
  if (couponMsg) couponMsg.textContent = '';
  const removeBtn = document.getElementById('couponRemoveBtn');
  if (removeBtn) removeBtn.style.display = 'none';
  cart = {};
  updateCartUI();
  products.forEach(p => syncCardFooter(p.id));
  ['fName', 'fLast', 'fPhone', 'fNotes'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('fPayment').value = 'cash';
  document.getElementById('fPickupDate').value = '';
  document.getElementById('fPickupTime').value = '';
  document.getElementById('fPickupTimeGroup').style.display = 'none';
  selectedPickupDate = '';
  document.querySelectorAll('#orderForm .pickup-opt').forEach((el, i) => el.classList.toggle('selected', i === 0));
}
