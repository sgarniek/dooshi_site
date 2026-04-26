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

// -- מוצרים — נטענים במלואם מ-Supabase ב-main.js --
let products = [];

// -- הזמנות --
// נשמרות ב-Supabase; המערך המקומי משמש רק לרינדור
let orders = [];

// פעולה SMS נוכחית (מוצג במודל)
let currentSMSAction = null;

// פילטר פעיל בחנות
let activeFilter = 'all';
