// =============================================
// cart.js — לוגיקת עגלת הקניות
// =============================================

// cart הוא אובייקט: { productId: quantity }
let cart = {};

// -- הוספה לעגלה --
function addToCart(productId) {
  cart[productId] = (cart[productId] || 0) + 1;
  updateCartUI();
  syncCardFooter(productId);
  showToast('נוסף לעגלה!', '🛒');
}

// -- שינוי כמות (+/-) --
function changeQty(productId, delta) {
  cart[productId] = Math.max(0, (cart[productId] || 0) + delta);
  if (!cart[productId]) delete cart[productId];
  updateCartUI();
  syncCardFooter(productId);
}

// -- קביעת כמות ישירות (שדה מספר) --
function setQty(productId, value) {
  const qty = parseInt(value, 10);
  if (isNaN(qty) || qty < 0) {
    syncCardFooter(productId); // השבת את הערך הנוכחי
    return;
  }
  if (qty === 0) {
    delete cart[productId];
  } else {
    cart[productId] = qty;
  }
  updateCartUI();
  syncCardFooter(productId);
}

// -- עדכון כל ממשק העגלה --
function updateCartUI() {
  const items = Object.entries(cart).filter(([, qty]) => qty > 0);

  const total = items.reduce((sum, [id, qty]) => {
    const product = products.find(p => p.id == id);
    return sum + (product ? product.price * qty : 0);
  }, 0);

  const totalCount = items.reduce((sum, [, qty]) => sum + qty, 0);

  // -- תג המספר בכפתור העגלה --
  const badge = document.getElementById('cartBadge');
  if (totalCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = totalCount;
  } else {
    badge.style.display = 'none';
  }

  // -- גוף העגלה --
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');

  if (!items.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🍪</div>
        <div>העגלה ריקה</div>
        <div style="font-size:0.8rem; margin-top:6px; color:var(--text-muted)">הוסיפו מוצרים מהחנות</div>
      </div>
    `;
    footer.style.display = 'none';
    return;
  }

  body.innerHTML = items.map(([id, qty]) => {
    const product = products.find(p => p.id == id);
    if (!product) return '';
    const squareThumb = product.image
      ? product.image.replace(/(\.[^.]+)$/, '-square$1')
      : null;
    return `
      <div class="cart-item">
        <div class="cart-item-emoji">
          ${squareThumb
            ? `<img src="${squareThumb}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`
            : product.emoji
          }
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${product.name}</div>
          <div class="cart-item-price">₪${product.price} ליחידה</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${id}, -1)">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" onclick="changeQty(${id}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  footer.style.display = 'block';
  document.getElementById('cartTotal').textContent = '₪' + total;

  if (typeof revalidateCoupon === 'function') revalidateCoupon();
}

// -- פתיחה/סגירה של ה-Drawer --
function toggleCart() {
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}

// -- מעבר לטופס הזמנה --
async function goToOrder() {
  const items = Object.entries(cart).filter(([, qty]) => qty > 0);
  if (!items.length) { showToast('העגלה ריקה', '⚠️'); return; }
  toggleCart();
  renderOrderSummary();
  await loadPickupSlots();

  if (editingOrderId && editingOrderData) {
    // Edit mode: update title and pre-fill saved details
    document.getElementById('orderFormTitle').textContent    = `עדכון הזמנה #${editingOrderId}`;
    document.getElementById('orderFormSubtitle').textContent = 'ניתן לשנות פרטים כל עוד ההזמנה טרם אושרה';

    const nameParts = editingOrderData.name.split(' ');
    document.getElementById('fName').value  = nameParts[0] || '';
    document.getElementById('fLast').value  = nameParts.slice(1).join(' ') || '';
    document.getElementById('fPhone').value = editingOrderData.phone;
    document.getElementById('fNotes').value = editingOrderData.notes;

    const pay = editingOrderData.payment;
    document.getElementById('fPayment').value = pay;
    document.querySelectorAll('#orderForm .pickup-opt').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('onclick')?.includes(pay));
    });

    if (editingOrderData.pickup_date && editingOrderData.pickup_time) {
      prefillPickupSelection(editingOrderData.pickup_date, editingOrderData.pickup_time);
    }
  }

  const couponSection = document.getElementById('couponSection');
  if (couponSection) couponSection.style.display = currentUser ? '' : 'none';

  showView('order');
}
