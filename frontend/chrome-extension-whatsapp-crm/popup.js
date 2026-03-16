/**
 * AXKAN WhatsApp CRM — Popup (Login/Status)
 */

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const loggedInDiv = document.getElementById('loggedIn');
const userNameSpan = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');

// Check auth state on popup open
chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (res) => {
  if (res && res.authenticated) {
    showLoggedIn(res.user);
  } else {
    showLoginForm();
  }
});

// Login with auto-retry on server errors (Render cold start)
let retryCount = 0;
const MAX_RETRIES = 2;
let savedUsername = '';
let savedPassword = '';

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Conectando...';

  savedUsername = document.getElementById('username').value;
  savedPassword = document.getElementById('password').value;
  retryCount = 0;

  attemptLogin();
});

function attemptLogin() {
  chrome.runtime.sendMessage({ type: 'LOGIN', username: savedUsername, password: savedPassword }, (res) => {
    if (res && res.success) {
      showLoggedIn(res.user);
      return;
    }

    const errorMsg = (res && res.error) || 'Error al iniciar sesion';
    const isServerError = errorMsg.includes('Server error') || errorMsg.includes('Cannot reach') || errorMsg.includes('waking');

    // Auto-retry on server errors (cold start)
    if (isServerError && retryCount < MAX_RETRIES) {
      retryCount++;
      loginBtn.textContent = `Servidor despertando... intento ${retryCount + 1}/${MAX_RETRIES + 1}`;
      setTimeout(attemptLogin, 5000);
      return;
    }

    loginError.textContent = errorMsg;
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Iniciar sesion';
  });
}

// Logout
logoutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showLoginForm();
  });
});

function showLoggedIn(user) {
  loginForm.hidden = true;
  loggedInDiv.hidden = false;
  userNameSpan.textContent = (user && user.username) || 'Admin';
}

function showLoginForm() {
  loginForm.hidden = false;
  loggedInDiv.hidden = true;
  loginBtn.disabled = false;
  loginBtn.textContent = 'Iniciar sesion';
}
