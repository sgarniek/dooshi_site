exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { to, firstName, resetUrl } = JSON.parse(event.body || '{}');

  if (!to || !resetUrl) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1A1208;">
      <div style="background: #0C1428; padding: 24px; text-align: center;">
        <span style="font-size: 2rem; font-weight: 700; color: #FDFCF8; letter-spacing: 4px;">Dooshi</span>
        <div style="font-size: 0.65rem; color: #C9A84C; letter-spacing: 2px; margin-top: 4px;">HOMEMADE IN TEL AVIV</div>
      </div>
      <div style="padding: 32px 24px; background: #FDFCF8; border: 1px solid #e2d8c8;">
        <p style="font-size: 1rem; margin-bottom: 8px;">שלום${firstName ? ' ' + firstName : ''},</p>
        <p style="font-size: 0.9rem; color: #7A6A50; line-height: 1.6; margin-bottom: 24px;">
          קיבלנו בקשה לאיפוס הסיסמה לחשבונך ב-Dooshi.<br/>
          לחץ על הכפתור למטה כדי להגדיר סיסמה חדשה. הקישור תקף לשעה אחת.
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetUrl}"
             style="background: #C9A84C; color: #0C1428; padding: 12px 32px; text-decoration: none;
                    font-weight: 700; font-size: 0.95rem; display: inline-block; border-radius: 2px;">
            איפוס סיסמה
          </a>
        </div>
        <p style="font-size: 0.78rem; color: #7A6A50; line-height: 1.6;">
          אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם מהמייל הזה.<br/>
          הקישור יפוג תוך שעה אחת.
        </p>
      </div>
      <div style="padding: 16px; text-align: center; font-size: 0.75rem; color: #7A6A50;">
        Dooshi — Homemade in Tel Aviv
      </div>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Dooshi <noreply@dooshi.co.il>',
      to:      [to],
      subject: 'איפוס סיסמה — Dooshi',
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return { statusCode: 500, body: 'Failed to send email' };
  }

  return { statusCode: 200, body: 'OK' };
};
