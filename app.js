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
let authMode = 'login';

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
const profileEmail = document.getElementById('profileEmail');
const newPasswordInput = document.getElementById('newPasswordInput');
const profileError = document.getElementById('profileError');

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
        'auth/operation-not-allowed': 'Email/Password вход отключён в Firebase Console',
        'auth/requires-recent-login': 'Для смены пароля нужно перелогиниться'
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

// ============ Генерация и проверка никнейма ============
function generateRandomNickname() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let nickname = '';
    for (let i = 0; i < 20; i++) { // Сделал 20 символов, 32 слишком длинно для базы
        nickname += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nickname;
}

async function checkAndSetUsername(newName) {
    if (!newName || newName.trim() === '') throw new Error('Никнейм не может быть пустым');
    newName = newName.trim().substring(0, 32);

    // Проверяем, не занят ли никнейм
    const usernameRef = window.firebaseApp.ref(database, `usernames/${newName}`);
    const snapshot = await window.firebaseApp.get(usernameRef);
    
    if (snapshot.exists() && snapshot.val() !== currentUser.uid) {
        throw new Error('Этот никнейм уже занят');
    }

    // Записываем в usernames (для уникальности) и в users (для профиля)
    const updates = {};
    updates[`usernames/${newName}`] = currentUser.uid;
    updates[`users/${currentUser.uid}/username`] = newName;

    // Если старый никнейм был, удаляем его
    const oldNameSnapshot = await window.firebaseApp.get(window.firebaseApp.ref(database, `users/${currentUser.uid}/username`));
    if (oldNameSnapshot.exists()) {
        const oldName = oldNameSnapshot.val();
        if (oldName !== newName) {
            updates[`usernames/${oldName}`] = null;
        }
    }

    await window.firebaseApp.update(window.firebaseApp.ref(database), updates);
    return newName;
}

async function getOrCreateUsername() {
    const userRef = window.firebaseApp.ref(database, `users/${currentUser.uid}/username`);
    const snapshot = await window.firebaseApp.get(userRef);

    if (snapshot.exists()) {
        return snapshot.val();
    }

    // Если в базе нет, генерируем и сохраняем
    let newName = generateRandomNickname();
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 5) {
        const checkRef = window.firebaseApp.ref(database, `usernames/${newName}`);
        const checkSnap = await window.firebaseApp.get(checkRef);
        if (!checkSnap.exists()) {
            isUnique = true;
        } else {
            newName = generateRandomNickname();
        }
        attempts++;
    }

    await checkAndSetUsername(newName);
    return newName;
}

// ============ Инициализация чата ============
async function initChat() {
    if (chatInitialized) return;
    chatInitialized = true;

    try {
        await currentUser.getIdToken(true); // Форсим свежий токен
        username = await getOrCreateUsername(); // Получаем из базы
    } catch (e) {
        console.error("Ошибка загрузки профиля:", e);
        alert("Ошибка профиля: " + e.message);
        chatInitialized = false;
        return;
    }

    messagesContainer.innerHTML = '';
    loadedMessageKeys.clear();
    isInitialLoad = true;
    foundLastReadMessage = false;
    usernameDisplay.textContent = username;
    lastReadMessageKey = localStorage.getItem(`chat_lastReadMessage_${currentUser.uid}`);

    const chatContainer = document.querySelector('.chat-container');
    let scrollTimeout;
    chatContainer.addEventListener('scroll', () => {
        isUserScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 200);
    });

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    changeNicknameBtn.addEventListener('click', openNicknameModal);
    closeModalBtn.addEventListener('click', closeNicknameModal);
    nicknameModal.addEventListener('click', (e) => {
        if (e.target === nicknameModal) closeNicknameModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nicknameModal.classList.contains('show')) closeNicknameModal();
    });
    
    saveNicknameBtn.addEventListener('click', handleProfileSave);
    generateNicknameBtn.addEventListener('click', () => {
        newNicknameInput.value = generateRandomNickname();
    });
    
    logoutBtn.addEventListener('click', handleLogout);

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
    if (!messagesRef || !currentUser) return;

    const message = {
        text: messageText,
        username: username,
        uid: currentUser.uid,
        timestamp: Date.now()
    };

    messageInput.value = '';
    window.firebaseApp.push(messagesRef, message)
        .catch((error) => {
            console.error('Ошибка отправки:', error);
            alert('Не удалось отправить: ' + error.message);
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

    const isOwn = messageData.uid ? messageData.uid === currentUser.uid : messageData.username === username;

    loadedMessageKeys.add(messageKey);
    messagesContainer.appendChild(createMessageElement(messageData, messageKey, isOwn));
    localStorage.setItem(`chat_lastReadMessage_${currentUser.uid}`, messageKey);

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
        if (isOwn) setTimeout(() => scrollToBottom(true), 50);
        else if (isNearBottom() && !isUserScrolling) setTimeout(() => scrollToBottom(true), 50);
    }
}

// ============ Модалка профиля ============
function openNicknameModal() {
    newNicknameInput.value = username;
    profileEmail.value = currentUser.email;
    newPasswordInput.value = '';
    profileError.textContent = '';
    nicknameModal.classList.add('show');
    newNicknameInput.focus();
}

function closeNicknameModal() { nicknameModal.classList.remove('show'); }

async function handleProfileSave() {
    profileError.textContent = '';
    profileError.style.color = '#e74c3c';
    const newName = newNicknameInput.value.trim();
    const newPassword = newPasswordInput.value;

    let hasChanges = false;

    // 1. Меняем никнейм
    if (newName && newName !== username) {
        try {
            saveNicknameBtn.disabled = true;
            username = await checkAndSetUsername(newName);
            usernameDisplay.textContent = username;
            hasChanges = true;
        } catch (e) {
            profileError.textContent = e.message;
            saveNicknameBtn.disabled = false;
            return;
        }
    }

    // 2. Меняем пароль (если введен)
    if (newPassword) {
        if (newPassword.length < 6) {
            profileError.textContent = 'Пароль должен быть не менее 6 символов';
            saveNicknameBtn.disabled = false;
            return;
        }
        try {
            await window.firebaseAuth.updatePassword(currentUser, newPassword);
            hasChanges = true;
        } catch (e) {
            profileError.textContent = authErrorMessage(e);
            saveNicknameBtn.disabled = false;
            return;
        }
    }

    saveNicknameBtn.disabled = false;
    if (hasChanges) {
        closeNicknameModal();
        alert('Профиль успешно обновлен!');
    } else {
        closeNicknameModal();
    }
}

// ============ Firebase init ============
function initFirebase() {
    if (!window.firebaseApp || !window.firebaseAuth) return;

    try {
        app = window.firebaseApp.initializeApp(firebaseConfig);
        database = window.firebaseApp.getDatabase(app);
        messagesRef = window.firebaseApp.ref(database, 'messages');
        auth = window.firebaseAuth.getAuth(app);

        loginTab.addEventListener('click', () => setAuthMode('login'));
        registerTab.addEventListener('click', () => setAuthMode('register'));
        authSubmitBtn.addEventListener('click', handleAuthSubmit);
        authPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
        authPasswordConfirm.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });
        
        resendVerifyBtn.addEventListener('click', handleResendVerification);
        checkVerifyBtn.addEventListener('click', handleCheckVerification);
        logoutBtnVerify.addEventListener('click', handleLogout);

        setAuthMode('login');
        window.firebaseAuth.onAuthStateChanged(auth, handleAuthStateChanged);
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
    }
}

// ============ Запуск ============
if (window.firebaseReady) {
    initFirebase();
} else {
    window.addEventListener('firebaseReady', initFirebase, { once: true });
}
