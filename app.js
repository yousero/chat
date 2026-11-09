// ============ Firebase конфиг ============
const firebaseConfig = {
    apiKey: "AIzaSyCkJoRTFfuD1mIHiJ1TnANANvW-S_G_iXI",
    authDomain: "chat-anonym-f876f.firebaseapp.com",
    databaseURL: "https://chat-anonym-f876f-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chat-anonym-f876f",
    storageBucket: "chat-anonym-f876f.firebasestorage.app",
    messagingSenderId: "709588409625",
    appId: "1:709588409625:web:39f986f47ae2aac102f988",
    measurementId: "G-PLEP9VFY5E"
};

// ============ Глобальное состояние ============
let app, database, messagesRef, auth;
let currentUser = null;
let username = '';
let chatInitialized = false;
let messageUnsubscribe = null;
let verifyPollInterval = null;
let authMode = 'login'; // 'login' | 'register'

// Скролл
let isUserScrolling = false;
let isInitialLoad = true;
let lastReadMessageKey = null;
let loadedMessageKeys = new Set();
let initialLoadTimeout;
let foundLastReadMessage = false;

// ============ DOM ============
const authScreen = document.getElementById('authScreen');
const verifyScreen = document.getElementById('verifyScreen');
const chatScreen = document.getElementById('chatScreen');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authPasswordConfirm = document.getElementById('authPasswordConfirm');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const verifyEmail = document.getElementById('verifyEmail');
const resendVerifyBtn = document.getElementById('resendVerifyBtn');
const checkVerifyBtn = document.getElementById('checkVerifyBtn');
const logoutBtnVerify = document.getElementById('logoutBtnVerify');
const verifyMessage = document.getElementById('verifyMessage');
const logoutBtn = document.getElementById('logoutBtn');

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const usernameDisplay = document.getElementById('username');
const changeNicknameBtn = document.getElementById('changeNicknameBtn');
const nicknameModal = document.getElementById('nicknameModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const newNicknameInput = document.getElementById('newNicknameInput');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');
const generateNicknameBtn = document.getElementById('generateNicknameBtn');

// ============ Никнейм (привязан к UID) ============
function generateRandomNickname() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let nickname = '';
    for (let i = 0; i < 32; i++) {
        nickname += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nickname;
}
function nicknameKey() {
    return `chat_nickname_${currentUser ? currentUser.uid : 'anon'}`;
}
function getOrCreateNickname() {
    const key = nicknameKey();
    let nickname = localStorage.getItem(key);
    if (!nickname) {
        nickname = generateRandomNickname();
        localStorage.setItem(key, nickname);
    }
    return nickname;
}

// ============ Last read (привязан к UID) ============
function lastReadKey() {
    return `chat_lastReadMessage_${currentUser ? currentUser.uid : 'anon'}`;
}
function saveLastReadMessage(key) { localStorage.setItem(lastReadKey(), key); }
function getLastReadMessage() { return localStorage.getItem(lastReadKey()); }

// ============ Управление экранами ============
function showScreen(name) {
    authScreen.style.display = name === 'auth' ? 'flex' : 'none';
    verifyScreen.style.display = name === 'verify' ? 'flex' : 'none';
    chatScreen.style.display = name === 'chat' ? 'flex' : 'none';
}

// ============ Auth: форма ============
function setAuthMode(mode) {
    authMode = mode;
    loginTab.classList.toggle('active', mode === 'login');
    registerTab.classList.toggle('active', mode === 'register');
    authPasswordConfirm.style.display = mode === 'register' ? 'block' : 'none';
    authSubmitBtn.textContent = mode === 'login' ? 'Login' : 'Register';
    authPassword.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    authError.textContent = '';
}

function authErrorMessage(err) {
    const map = {
        'auth/invalid-email': 'Неверный email',
        'auth/user-disabled': 'Аккаунт заблокирован',
        'auth/user-not-found': 'Аккаунт не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/network-request-failed': 'Ошибка сети. Проверьте подключение',
        'auth/operation-not-allowed': 'Email/Password вход отключён в Firebase Console'
    };
    return map[err.code] || (err.message || 'Неизвестная ошибка');
}

async function handleAuthSubmit() {
    authError.textContent = '';
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        authError.textContent = 'Заполните все поля';
        return;
    }

    try {
        authSubmitBtn.disabled = true;
        if (authMode === 'login') {
            await window.firebaseAuth.signInWithEmailAndPassword(auth, email, password);
            // экран переключит onAuthStateChanged
        } else {
            const confirmPw = authPasswordConfirm.value;
            if (password !== confirmPw) {
                authError.textContent = 'Пароли не совпадают';
                return;
            }
            if (password.length < 6) {
                authError.textContent = 'Пароль должен содержать минимум 6 символов';
                return;
            }
            const cred = await window.firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
            await window.firebaseAuth.sendEmailVerification(cred.user);
            // onAuthStateChanged покажет экран верификации
        }
    } catch (err) {
        console.error('Auth error:', err);
        authError.textContent = authErrorMessage(err);
    } finally {
        authSubmitBtn.disabled = false;
    }
}

// ============ Auth: верификация ============
async function handleResendVerification() {
    if (!currentUser) return;
    verifyMessage.style.color = '#333';
    try {
        await window.firebaseAuth.sendEmailVerification(currentUser);
        verifyMessage.textContent = 'Письмо отправлено повторно ✓';
        verifyMessage.style.color = 'green';
    } catch (err) {
        verifyMessage.textContent = authErrorMessage(err);
        verifyMessage.style.color = '#e74c3c';
    }
}

async function handleCheckVerification() {
    if (!currentUser) return;
    verifyMessage.style.color = '#333';
    verifyMessage.textContent = 'Проверяем...';
    try {
        await window.firebaseAuth.reload(currentUser);
        if (currentUser.emailVerified) {
            verifyMessage.textContent = 'Email подтверждён!';
            verifyMessage.style.color = 'green';
            handleAuthStateChanged(currentUser);
        } else {
            verifyMessage.textContent = 'Почта пока не подтверждена. Проверьте inbox.';
        }
    } catch (err) {
        verifyMessage.textContent = authErrorMessage(err);
        verifyMessage.style.color = '#e74c3c';
    }
}

function startVerifyPolling() {
    stopVerifyPolling();
    verifyPollInterval = setInterval(async () => {
        if (!currentUser) return;
        try {
            await window.firebaseAuth.reload(currentUser);
            if (currentUser.emailVerified) {
                handleAuthStateChanged(currentUser);
            }
        } catch (e) { /* игнорируем */ }
    }, 5000);
}
function stopVerifyPolling() {
    if (verifyPollInterval) {
        clearInterval(verifyPollInterval);
        verifyPollInterval = null;
    }
}

async function handleLogout() {
    try {
        await window.firebaseAuth.signOut(auth);
        window.location.reload();
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// ============ Auth state ============
function handleAuthStateChanged(user) {
    currentUser = user;

    if (!user) {
        teardownChat();
        stopVerifyPolling();
        showScreen('auth');
        return;
    }

    if (!user.emailVerified) {
        teardownChat();
        verifyEmail.textContent = user.email;
        verifyMessage.textContent = '';
        showScreen('verify');
        startVerifyPolling();
        return;
    }

    stopVerifyPolling();
    showScreen('chat');
    initChat();
}

// ============ Инициализация чата ============
function initChat() {
    if (chatInitialized) return;
    chatInitialized = true;

    // Сброс состояния
    messagesContainer.innerHTML = '';
    loadedMessageKeys.clear();
    isInitialLoad = true;
    foundLastReadMessage = false;

    username = getOrCreateNickname();
    usernameDisplay.textContent = username;
    lastReadMessageKey = getLastReadMessage();

    // Обработка скролла
    const chatContainer = document.querySelector('.chat-container');
    let scrollTimeout;
    chatContainer.addEventListener('scroll', () => {
        isUserScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 200);
    });

    // Отправка
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Модалка никнейма
    changeNicknameBtn.addEventListener('click', openNicknameModal);
    closeModalBtn.addEventListener('click', closeNicknameModal);
    nicknameModal.addEventListener('click', (e) => {
        if (e.target === nicknameModal) closeNicknameModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nicknameModal.classList.contains('show')) closeNicknameModal();
    });
    saveNicknameBtn.addEventListener('click', () => changeNickname(newNicknameInput.value));
    generateNicknameBtn.addEventListener('click', () => {
        newNicknameInput.value = generateRandomNickname();
        newNicknameInput.focus();
        newNicknameInput.select();
    });
    newNicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') changeNickname(newNicknameInput.value);
    });

    // Logout
    logoutBtn.addEventListener('click', handleLogout);

    // Слушатель сообщений
    if (messagesRef) {
        messageUnsubscribe = window.firebaseApp.onChildAdded(messagesRef, handleMessageAdded, (error) => {
            console.error('Ошибка чтения сообщений:', error);
        });
    }
}

function teardownChat() {
    if (!chatInitialized) return;
    chatInitialized = false;
    if (messageUnsubscribe) { messageUnsubscribe(); messageUnsubscribe = null; }
    messagesContainer.innerHTML = '';
    loadedMessageKeys.clear();
}

// ============ Отправка сообщения ============
function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText === '') return;
    if (!messagesRef || !currentUser) {
        alert('Ошибка: база данных не подключена');
        return;
    }

    const message = {
        text: messageText,
        username: username,
        uid: currentUser.uid,
        timestamp: Date.now()
    };

    messageInput.value = '';

    window.firebaseApp.push(messagesRef, message)
        .then((ref) => console.log('Сообщение отправлено, ключ:', ref.key))
        .catch((error) => {
            console.error('Ошибка отправки:', error);
            alert('Не удалось отправить сообщение: ' + error.message);
            messageInput.value = messageText;
        });
}

// ============ Обработка сообщений ============
function formatTime(timestamp) {
    const d = new Date(timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function isNearBottom() {
    const c = document.querySelector('.chat-container');
    return c.scrollHeight - c.scrollTop - c.clientHeight < 150;
}

function scrollToBottom(smooth = true) {
    const c = document.querySelector('.chat-container');
    if (smooth) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    else c.scrollTop = c.scrollHeight;
}

function createMessageElement(messageData, messageKey, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    div.dataset.messageKey = messageKey;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = isOwn ? 'Вы' : messageData.username;

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = messageData.text;

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(messageData.timestamp);

    div.append(header, text, time);
    return div;
}

function handleMessageAdded(snapshot) {
    if (!snapshot || !snapshot.val()) return;
    const messageData = snapshot.val();
    const messageKey = snapshot.key;

    if (!messageData || !messageData.text || !messageData.username) return;
    if (loadedMessageKeys.has(messageKey)) return;

    // Определяем "своё" по UID (fallback на username для старых сообщений)
    const isOwn = messageData.uid
        ? messageData.uid === currentUser.uid
        : messageData.username === username;

    loadedMessageKeys.add(messageKey);
    messagesContainer.appendChild(createMessageElement(messageData, messageKey, isOwn));
    saveLastReadMessage(messageKey);

    if (isInitialLoad) {
        if (lastReadMessageKey && messageKey === lastReadMessageKey && !foundLastReadMessage) {
            foundLastReadMessage = true;
            clearTimeout(initialLoadTimeout);
            setTimeout(() => {
                messagesContainer.querySelector(`[data-message-key="${messageKey}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => { isInitialLoad = false; }, 500);
            }, 300);
            return;
        }
        if (!lastReadMessageKey || !foundLastReadMessage) {
            clearTimeout(initialLoadTimeout);
            initialLoadTimeout = setTimeout(() => {
                if (isInitialLoad) { scrollToBottom(false); isInitialLoad = false; }
            }, 800);
        }
    } else {
        if (isOwn) {
            setTimeout(() => scrollToBottom(true), 50);
        } else if (isNearBottom() && !isUserScrolling) {
            setTimeout(() => scrollToBottom(true), 50);
        }
    }
}

// ============ Модалка никнейма ============
function openNicknameModal() {
    newNicknameInput.value = username;
    nicknameModal.classList.add('show');
    newNicknameInput.focus();
    newNicknameInput.select();
}
function closeNicknameModal() { nicknameModal.classList.remove('show'); }
function changeNickname(newNickname) {
    if (!newNickname || !newNickname.trim()) { alert('Никнейм не может быть пустым'); return; }
    newNickname = newNickname.trim().substring(0, 32);
    username = newNickname;
    localStorage.setItem(nicknameKey(), username);
    usernameDisplay.textContent = username;
    closeNicknameModal();
}

// ============ Firebase init ============
function initFirebase() {
    if (!window.firebaseApp || !window.firebaseAuth) {
        window.addEventListener('firebaseReady', initFirebase, { once: true });
        return;
    }

    try {
        app = window.firebaseApp.initializeApp(firebaseConfig);
        database = window.firebaseApp.getDatabase(app);
        messagesRef = window.firebaseApp.ref(database, 'messages');
        auth = window.firebaseAuth.getAuth(app);

        // Подключаем UI auth
        loginTab.addEventListener('click', () => setAuthMode('login'));
        registerTab.addEventListener('click', () => setAuthMode('register'));
        authSubmitBtn.addEventListener('click', handleAuthSubmit);
        authPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
        authPasswordConfirm.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
        resendVerifyBtn.addEventListener('click', handleResendVerification);
        checkVerifyBtn.addEventListener('click', handleCheckVerification);
        logoutBtnVerify.addEventListener('click', handleLogout);

        setAuthMode('login');

        // Слушатель состояния авторизации
        window.firebaseAuth.onAuthStateChanged(auth, handleAuthStateChanged);
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        alert('Ошибка подключения к базе данных. Проверьте консоль.');
    }
}

// ============ Boot ============
if (window.firebaseReady) {
    initFirebase();
} else {
    window.addEventListener('firebaseReady', initFirebase, { once: true });
}
