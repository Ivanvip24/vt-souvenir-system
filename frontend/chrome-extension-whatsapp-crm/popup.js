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

// Login
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Conectando...';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  chrome.runtime.sendMessage({ type: 'LOGIN', username, password }, (res) => {
    if (res && res.success) {
      showLoggedIn(res.user);
    } else {
      loginError.textContent = (res && res.error) || 'Error al iniciar sesion';
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar sesion';
    }
  });
});

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
