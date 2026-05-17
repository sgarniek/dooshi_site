const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = 'https://dqqrlthiinoyqirzfvrb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcXJsdGhpaW5veXFpcnpmdnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODI3MTcsImV4cCI6MjA5MTU1ODcxN30.An1Zo4Mc__bAVXJ5vbSAqIxHxkOzz2g90b0cjFbg5JI';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  const { eventType, data } = JSON.parse(event.body || '{}');
  if (!eventType || !data) {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Missing fields' };
  }

  // Get subscribed admins for this event
  const settings = await supabaseGet(
    `admin_notification_settings?event_type=eq.${eventType}&enabled=eq.true&select=admin_id`
  );

  if (!settings?.length) return { statusCode: 200, headers: CORS_HEADERS, body: 'No subscribers' };

  const adminIds = settings.map(s => `id.eq.${s.admin_id}`).join(',');
  const admins   = await supabaseGet(`admins?or=(${adminIds})&select=email,first_name`);

  if (!admins?.length) return { statusCode: 200, headers: CORS_HEADERS, body: 'No admins found' };

  // Build emoji map from product table for correct icons
  const productRows = await supabaseGet('product?select=name,emoji,type,is_bundle');
  const emojiMap = {};
  (productRows || []).forEach(p => {
    if (!p.name) return;
    const emoji = p.is_bundle ? '🎁' : (p.emoji && p.emoji !== '🍪' ? p.emoji : (p.type === 'muffin' ? '🧁' : '🍪'));
    emojiMap[p.name] = emoji;
  });

  const adminUrl = 'https://admin.dooshi.co.il';

  const emails = admins.map(admin => {
    const subjects = {
      new_order:       `הזמנה חדשה #${data.orderId} — Dooshi`,
      new_customer:    `לקוח חדש נרשם — Dooshi`,
      order_modified:  `הזמנה #${data.orderId} עודכנה — Dooshi`,
      order_cancelled: `הזמנה #${data.orderId} בוטלה — Dooshi`,
    };
    const subject = subjects[eventType] || `התראה — Dooshi`;

    const itemsHtml = data.items?.length ? `
        <table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:0.88rem;">
          <thead>
            <tr style="border-bottom:1px solid #e2d8c8;">
              <th style="text-align:right; padding:4px 0; color:#7A6A50;">פריט</th>
              <th style="text-align:center; padding:4px 0; color:#7A6A50;">כמות</th>
              <th style="text-align:left; padding:4px 0; color:#7A6A50;">מחיר</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(i => `
            <tr style="border-bottom:1px solid #f0ebe2;">
              <td style="padding:5px 0;">${emojiMap[i.name] || i.emoji} ${i.name}</td>
              <td style="text-align:center; padding:5px 0;">×${i.qty}</td>
              <td style="text-align:left; padding:5px 0;">₪${i.price * i.qty}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '';

    const orderDetails = data.orderId ? `
        <ul style="line-height:2; margin-bottom:8px;">
          <li><strong>מספר הזמנה:</strong> #${data.orderId}</li>
          <li><strong>שם:</strong> ${data.name}</li>
          <li><strong>טלפון:</strong> ${data.phone}</li>
          <li><strong>תשלום:</strong> ${data.payment === 'cash' ? 'מזומן' : 'Bit'}</li>
          <li><strong>איסוף:</strong> ${data.pickupDate || '—'}</li>
        </ul>
        ${itemsHtml}
        <p style="font-weight:700; font-size:0.95rem; color:#0C1428;">סה"כ: ₪${data.total}</p>` : '';

    const bodies = {
      new_order:       `<p>התקבלה הזמנה חדשה:</p>${orderDetails}`,
      new_customer:    `<p>לקוח חדש נרשם למערכת:</p><ul style="line-height:2;"><li><strong>שם:</strong> ${data.firstName} ${data.lastName}</li><li><strong>מייל:</strong> ${data.email}</li><li><strong>טלפון:</strong> ${data.phone}</li></ul>`,
      order_modified:  `<p>לקוח עדכן הזמנה קיימת:</p>${orderDetails}`,
      order_cancelled: `
        <div style="background:#FEF2F2; border:2px solid #DC2626; border-radius:4px; padding:12px 16px; margin-bottom:16px; text-align:center;">
          <span style="color:#DC2626; font-weight:700; font-size:1.1rem;">❌ הזמנה בוטלה</span>
        </div>
        <p>לקוח ביטל את ההזמנה הבאה:</p>${orderDetails}`,
    };
    const body = bodies[eventType] || '';

    const linkLabel = eventType === 'new_customer' ? 'לצפייה בלקוחות' : 'לצפייה בהזמנות';
    const linkUrl   = eventType === 'new_customer' ? `${adminUrl}?tab=customers` : adminUrl;

    return {
      from:    'Dooshi <noreply@dooshi.co.il>',
      to:      [admin.email],
      subject,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto; color:#1A1208;">
          <div style="background:#0C1428; padding:24px; text-align:center;">
            <span style="font-size:2rem; font-weight:700; color:#FDFCF8; letter-spacing:4px;">Dooshi</span>
          </div>
          <div style="padding:32px 24px; background:#FDFCF8; border:1px solid #e2d8c8;">
            <p style="font-size:1rem; margin-bottom:16px;">שלום${admin.first_name ? ' ' + admin.first_name : ''},</p>
            ${body}
            <div style="text-align:center; margin-top:24px;">
              <a href="${linkUrl}" style="background:#C9A84C; color:#0C1428; padding:12px 32px;
                 text-decoration:none; font-weight:700; font-size:0.95rem;
                 display:inline-block; border-radius:2px;">${linkLabel}</a>
            </div>
          </div>
          <div style="padding:16px; text-align:center; font-size:0.75rem; color:#7A6A50;">
            Dooshi — Homemade in Tel Aviv
          </div>
        </div>`,
    };
  });

  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: 'Failed to send' };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
};
