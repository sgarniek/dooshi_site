// =============================================
// data.js — כל הנתונים של האתר
// =============================================
// זה הקובץ שתערוך הכי הרבה!
// כאן תוסיף/תשנה מוצרים, סיסמה וכו'
// =============================================

// -- Supabase --
const SUPABASE_URL = 'https://dqqrlthiinoyqirzfvrb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcXJsdGhpaW5veXFpcnpmdnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODI3MTcsImV4cCI6MjA5MTU1ODcxN30.An1Zo4Mc__bAVXJ5vbSAqIxHxkOzz2g90b0cjFbg5JI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// -- מוצרים --
// כל מוצר מכיל:
//   id      — מספר ייחודי (אל תשנה)
//   name    — שם המוצר בעברית
//   desc    — תיאור קצר
//   price   — מחיר בשקלים
//   emoji   — האמוג'י שמוצג (אפשר להחליף בנתיב לתמונה בעתיד)
//   type    — 'cookie' או 'muffin'
//   active  — true = מוצג בחנות, false = מוסתר
let products = [
  {
    id: 1,
    name: "עוגיית שוקולד צ'יפס",
    desc: 'קלאסיקה ביתית עם שוקולד בלגי איכותי',
    price: 13,
    emoji: '🍪',
    type: 'cookie',
    active: true,
    image: 'images/chocolate-chip-cookies.jpg'
  },
  {
    id: 2,
    name: 'מאפין אוכמניות',
    desc: 'עם אוכמניות טריות ועיטור סוכר גבישי',
    price: 13,
    emoji: '🫐',
    type: 'muffin',
    active: true,
    image: 'images/blueberry-muffin.jpg'
  },
  {
    id: 3,
    name: "מאפין בננה עם שוקולד צ'יפס",
    desc: 'מאפין בננה עשיר ולח עם שוקולד',
    price: 13,
    emoji: '🍌',
    type: 'muffin',
    active: true,
    image: 'images/banana-muffin.jpg'
  },
  
];

// -- הזמנות --
// נשמרות ב-Supabase; המערך המקומי משמש רק לרינדור
let orders = [];

// פעולה SMS נוכחית (מוצג במודל)
let currentSMSAction = null;

// פילטר פעיל בחנות
let activeFilter = 'all';
