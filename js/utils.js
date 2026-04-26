// =============================================
// utils.js — פונקציות עזר כלליות
// =============================================

// -- החלפת View --
// מציג view אחד ומסתיר את כולם
function showView(viewName) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.remove('active');
  });
  document.getElementById('view-' + viewName).classList.add('active');
  window.scrollTo(0, 0);
  if (viewName === 'history') renderOrderHistory();
}

// -- כניסה לניהול — מעביר לדף הניהול הנפרד --
function showAdmin() {
  window.location.href = 'https://admin.dooshi.co.il';
}

// -- Toast — הודעה קצרה בתחתית --
let toastTimer;

function showToast(message, icon = '') {
  const el = document.getElementById('toast');
  el.textContent = (icon ? icon + ' ' : '') + message;
  el.classList.add('show');

  // מסתיר אחרי 2.5 שניות
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

// -- Modal SMS --
function closeModal() {
  document.getElementById('smsModal').classList.remove('open');
  currentSMSAction = null;
}

// סגירת מודל בלחיצה על הרקע
const _smsModal = document.getElementById('smsModal');
if (_smsModal) {
  _smsModal.addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
}
