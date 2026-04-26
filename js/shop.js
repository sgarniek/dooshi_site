// =============================================
// shop.js — רינדור מוצרים ופילטור
// =============================================

// מצייר את רשת המוצרים לפי הפילטר הפעיל
function renderProducts() {
  const grid = document.getElementById('productsGrid');

  const activeProducts = products.filter(p => p.active);
  const filtered = activeFilter === 'all'
    ? activeProducts
    : activeFilter === 'bundle'
      ? activeProducts.filter(p => p.is_bundle)
      : activeProducts.filter(p => p.type === activeFilter);

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state">אין מוצרים זמינים כרגע</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card" data-pid="${p.id}">

      <div class="product-img">
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" class="product-photo" />`
          : `<span style="font-size:4rem">${p.emoji}</span>`
        }
      </div>

      <div class="product-info">
        <div class="product-badges">
          <span class="product-badge ${p.type === 'cookie' ? 'badge-cookie' : 'badge-muffin'}">${p.type === 'cookie' ? 'עוגייה' : 'מאפין'}</span>
          ${p.is_bundle ? '<span class="product-badge badge-bundle">מארז</span>' : ''}
        </div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.desc}</div>
        <div class="product-footer">
          ${buildCardFooter(p)}
        </div>
      </div>

    </div>
  `).join('');
}

// בונה את תוכן ה-footer של כרטיס מוצר לפי הכמות בעגלה
function buildCardFooter(p) {
  const qty = cart[p.id] || 0;
  const priceTag = `<span class="product-price">₪${p.price}</span>`;
  if (qty > 0) {
    return priceTag + `
      <div class="card-qty-ctrl">
        <button class="card-qty-btn" onclick="changeQty(${p.id}, -1)">−</button>
        <input class="card-qty-input" type="number" value="${qty}" min="0"
               onblur="setQty(${p.id}, this.value)" />
        <button class="card-qty-btn" onclick="changeQty(${p.id}, 1)">+</button>
      </div>`;
  }
  return priceTag + `<button class="add-btn" onclick="addToCart(${p.id})">+</button>`;
}

// מעדכן רק את ה-footer של כרטיס מוצר ספציפי — ללא רינדור מחדש של כל הגריד
function syncCardFooter(productId) {
  const pid = Number(productId);
  const card = document.querySelector(`.product-card[data-pid="${pid}"]`);
  if (!card) return;
  const footer = card.querySelector('.product-footer');
  if (!footer) return;
  const p = products.find(pr => pr.id === pid);
  if (!p) return;
  footer.innerHTML = buildCardFooter(p);
}

// -- שינוי פילטר --
function filterProducts(type, buttonEl) {
  activeFilter = type;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  buttonEl.classList.add('active');
  renderProducts();
}
