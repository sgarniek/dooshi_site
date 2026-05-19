const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  const { emails, coupon } = JSON.parse(event.body || '{}');
  if (!emails?.length || !coupon) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Missing required fields' };
  }

  const discountLabel = coupon.type === 'fixed'
    ? `₪${coupon.value} הנחה`
    : `${coupon.value}% הנחה${coupon.max_discount ? ` (עד ₪${coupon.max_discount})` : ''}`;

  const expiryLine = coupon.expires_at
    ? `<p style="font-size:0.85rem; color:#B45309; margin-bottom:16px;">⏰ הקופון תקף עד: <strong>${new Date(coupon.expires_at + 'T00:00:00').toLocaleDateString('he-IL')}</strong></p>`
    : '';

  const minOrderLine = coupon.min_order_amount > 0
    ? `<p style="font-size:0.82rem; color:#7A6A50; margin-bottom:16px;">מינימום הזמנה: ₪${coupon.min_order_amount}</p>`
    : '';

  const messages = emails.map(to => ({
    from:    'Dooshi <noreply@dooshi.co.il>',
    to:      [to],
    subject: 'הזמנה מיוחדת עם קופון — Dooshi',
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto; color:#1A1208;">
        <div style="background:#0C1428; padding:24px; text-align:center;">
          <span style="font-size:2rem; font-weight:700; color:#FDFCF8; letter-spacing:4px;">Dooshi</span>
          <div style="font-size:0.65rem; color:#C9A84C; letter-spacing:2px; margin-top:4px;">HOMEMADE IN TEL AVIV</div>
        </div>
        <div style="padding:32px 24px; background:#FDFCF8; border:1px solid #e2d8c8;">
          <p style="font-size:1rem; margin-bottom:16px;">שלום,</p>
          <p style="font-size:0.9rem; color:#7A6A50; line-height:1.6; margin-bottom:24px;">
            קיבלת הזמנה להצטרף ל-Dooshi — עוגיות ומאפינס תוצרת בית מתל אביב.<br/>
            כמתנת הצטרפות, הכנו עבורך קופון הנחה מיוחד:
          </p>
          <div style="background:#f5f0e8; border:2px dashed #C9A84C; border-radius:6px; padding:20px; text-align:center; margin-bottom:24px;">
            <div style="font-size:0.75rem; color:#7A6A50; letter-spacing:2px; text-transform:uppercase; margin-bottom:8px;">קוד הקופון שלך</div>
            <div style="font-size:1.8rem; font-weight:700; color:#0C1428; letter-spacing:4px; font-family:monospace;">${coupon.code}</div>
            <div style="font-size:1rem; color:#C9A84C; font-weight:600; margin-top:8px;">${discountLabel}</div>
          </div>
          ${expiryLine}
          ${minOrderLine}
          <div style="background:#FEF9EC; border:1px solid #C9A84C; border-radius:4px; padding:12px 16px; margin-bottom:20px; font-size:0.85rem; color:#7A6A50; line-height:1.6;">
            ⚠️ יש להירשם לאתר על מנת שהקופון יחול על ההזמנה שלך.
          </div>
          <div style="text-align:center; margin-bottom:24px;">
            <a href="https://dooshi.co.il/?action=register"
               style="background:#C9A84C; color:#0C1428; padding:12px 32px; text-decoration:none;
                      font-weight:700; font-size:0.95rem; display:inline-block; border-radius:2px;">
              להרשמה ולהזמנה
            </a>
          </div>
          <p style="font-size:0.78rem; color:#7A6A50; line-height:1.6;">
            הקופון מיועד עבורך אישית ויופעל לאחר ההרשמה באתר.
          </p>
        </div>
        <div style="padding:16px; text-align:center; font-size:0.75rem; color:#7A6A50;">
          Dooshi — Homemade in Tel Aviv
        </div>
      </div>`,
  }));

  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: 'Failed to send' };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
};
