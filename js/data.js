// =============================================
// data.js — כל הנתונים של האתר
// =============================================
// זה הקובץ שתערוך הכי הרבה!
// כאן תוסיף/תשנה מוצרים, סיסמה וכו'
// =============================================

// -- Supabase --
const SUPABASE_URL = 'https://dqqrlthiinoyqirzfvrb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H3SunmJ5mvMOvDfJSFdTBw_U4dt5I1I';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// -- מוצרים — נטענים במלואם מ-Supabase ב-main.js --
let products = [];

// -- הזמנות --
// נשמרות ב-Supabase; המערך המקומי משמש רק לרינדור
let orders = [];

// פעולה SMS נוכחית (מוצג במודל)
let currentSMSAction = null;

// פילטר פעיל בחנות
let activeFilter = 'all';
