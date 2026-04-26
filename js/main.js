// =============================================
// main.js — אתחול האתר
// קובץ זה נטען אחרון (אחרי כל שאר ה-JS)
// =============================================

// אתחול ראשוני — טעינת הגדרות מוצרים מ-Supabase לפני רינדור
(async () => {
  const { data } = await db.from('product')
    .select('product_id, name, price, description, image_url, active, type, emoji, is_bundle')
    .order('product_id');
  if (data) {
    data.forEach(row => {
      let p = products.find(p => p.id === row.product_id);
      if (!p) {
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
  renderProducts();
  updateCartUI();
  initAuth();
})();


// =============================================
// הוספת הזמנת דמו לצורך הדגמה בלוח הניהול
// הסר את הקוד הזה כשרוצים אתר "נקי"
// =============================================
// orders.push({
//   num:         1001,
//   name:        'מיכל כהן',
//   phone:       '054-1234567',
//   payment:     'bit',
//   notes:       'בבקשה ללא אגוזים',
//   items: [
//     { id: 1, qty: 6, product: products.find(p => p.id === 1) },
//     { id: 5, qty: 2, product: products.find(p => p.id === 5) }
//   ],
//   total:       72,
//   status:      'new',
//   ts:          new Date().toLocaleString('he-IL'),
//   smsApproved: false,
//   smsReady:    false
// });
