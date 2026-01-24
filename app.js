// Генерация случайного никнейма из 32 символов
function generateRandomNickname() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let nickname = '';
    for (let i = 0; i < 32; i++) {
        nickname += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nickname;
}

// Получение или создание никнейма
function getOrCreateNickname() {
    let nickname = localStorage.getItem('chat_nickname');
    if (!nickname) {
        nickname = generateRandomNickname();
        localStorage.setItem('chat_nickname', nickname);
    }
    return nickname;
}

// Сохранение последнего прочитанного сообщения
function saveLastReadMessage(messageKey) {
    localStorage.setItem('chat_lastReadMessage', messageKey);
}

// Получение последнего прочитанного сообщения
function getLastReadMessage() {
    return localStorage.getItem('chat_lastReadMessage');
}

// Инициализация Firebase
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

// Инициализация приложения
let app, database, messagesRef;

function initFirebase() {
    if (!window.firebaseApp) {
        console.log('Ожидание загрузки Firebase...');
        window.addEventListener('firebaseReady', initFirebase, { once: true });
        return;
    }

    try {
        app = window.firebaseApp.initializeApp(firebaseConfig);
        database = window.firebaseApp.getDatabase(app);
        messagesRef = window.firebaseApp.ref(database, 'messages');
        console.log('Firebase инициализирован успешно');
        
        // Инициализируем остальную часть приложения
        initApp();
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        alert('Ошибка подключения к базе данных. Проверьте консоль браузера.');
    }
}

// Элементы DOM
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

// Получение никнейма (делаем переменной, чтобы можно было изменять)
let username = getOrCreateNickname();
usernameDisplay.textContent = username;

// Флаги для управления скроллом
let isUserScrolling = false;
let isInitialLoad = true;
let lastReadMessageKey = getLastReadMessage();
let loadedMessageKeys = new Set();

// Проверка, находится ли пользователь внизу чата
function isNearBottom() {
    const container = document.querySelector('.chat-container');
    const threshold = 150; // пикселей от низа
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

// Плавная прокрутка вниз
function scrollToBottom(smooth = true) {
    const container = document.querySelector('.chat-container');
    if (smooth) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        container.scrollTop = container.scrollHeight;
    }
}

// Отправка сообщения
function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText === '') return;

    if (!messagesRef) {
        console.error('messagesRef не инициализирован');
        alert('Ошибка: база данных не подключена');
        return;
    }

    const message = {
        text: messageText,
        username: username,
        timestamp: Date.now()
    };

    console.log('Отправка сообщения:', message);

    // Очищаем поле ввода сразу
    messageInput.value = '';

    window.firebaseApp.push(messagesRef, message)
        .then((ref) => {
            console.log('Сообщение отправлено успешно, ключ:', ref.key);
        })
        .catch((error) => {
            console.error('Ошибка отправки сообщения:', error);
            alert('Не удалось отправить сообщение: ' + error.message);
            // Восстанавливаем текст при ошибке
            messageInput.value = messageText;
        });
}

// Форматирование времени
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Создание элемента сообщения
function createMessageElement(messageData, messageKey, isOwn = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    messageDiv.dataset.messageKey = messageKey;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = isOwn ? 'Вы' : messageData.username;

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = messageData.text;

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(messageData.timestamp);

    messageDiv.appendChild(header);
    messageDiv.appendChild(text);
    messageDiv.appendChild(time);

    return messageDiv;
}

// Обработчик добавления сообщения
let initialLoadTimeout;
let foundLastReadMessage = false;

function handleMessageAdded(snapshot) {
    if (!snapshot || !snapshot.val()) {
        console.warn('Получен пустой snapshot');
        return;
    }

    const messageData = snapshot.val();
    const messageKey = snapshot.key;
    
    if (!messageData || !messageData.text || !messageData.username) {
        console.warn('Некорректные данные сообщения:', messageData);
        return;
    }

    const isOwn = messageData.username === username;

    // Пропускаем, если сообщение уже добавлено
    if (loadedMessageKeys.has(messageKey)) {
        console.log('Сообщение уже загружено, пропускаем:', messageKey);
        return;
    }

    console.log('Добавление нового сообщения:', messageKey, messageData.text);

    loadedMessageKeys.add(messageKey);
    const messageElement = createMessageElement(messageData, messageKey, isOwn);
    messagesContainer.appendChild(messageElement);

    // Сохраняем ключ последнего сообщения
    saveLastReadMessage(messageKey);
    console.log('Последнее прочитанное сообщение сохранено:', messageKey);

    // Логика прокрутки при начальной загрузке
    if (isInitialLoad) {
        // Ищем последнее прочитанное сообщение
        if (lastReadMessageKey && messageKey === lastReadMessageKey && !foundLastReadMessage) {
            foundLastReadMessage = true;
            clearTimeout(initialLoadTimeout);
            setTimeout(() => {
                messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // После прокрутки к последнему прочитанному, завершаем начальную загрузку
                setTimeout(() => {
                    isInitialLoad = false;
                }, 500);
            }, 300);
            return;
        }

        // Если нет сохраненного сообщения или оно не найдено, прокручиваем вниз после небольшой задержки
        if (!lastReadMessageKey || !foundLastReadMessage) {
            clearTimeout(initialLoadTimeout);
            initialLoadTimeout = setTimeout(() => {
                if (isInitialLoad) {
                    scrollToBottom(false);
                    isInitialLoad = false;
                }
            }, 800);
        }
    } else {
        // При получении новых сообщений: прокручиваем только если пользователь внизу или это его сообщение
        if (isOwn) {
            // Всегда прокручиваем для своих сообщений
            setTimeout(() => {
                scrollToBottom(true);
            }, 50);
        } else if (isNearBottom() && !isUserScrolling) {
            // Прокручиваем только если пользователь уже внизу
            setTimeout(() => {
                scrollToBottom(true);
            }, 50);
        }
    }
}

// Функции для работы с никнеймом
function openNicknameModal() {
    newNicknameInput.value = username;
    nicknameModal.classList.add('show');
    newNicknameInput.focus();
    newNicknameInput.select();
}

function closeNicknameModal() {
    nicknameModal.classList.remove('show');
}

function changeNickname(newNickname) {
    if (!newNickname || newNickname.trim() === '') {
        alert('Никнейм не может быть пустым');
        return;
    }
    
    newNickname = newNickname.trim();
    
    // Ограничиваем длину до 32 символов
    if (newNickname.length > 32) {
        newNickname = newNickname.substring(0, 32);
    }
    
    // Сохраняем новый никнейм
    username = newNickname;
    localStorage.setItem('chat_nickname', username);
    usernameDisplay.textContent = username;
    
    console.log('Никнейм изменен на:', username);
    closeNicknameModal();
}

// Инициализация приложения после подключения Firebase
function initApp() {
    // Обработка скролла пользователя
    const chatContainer = document.querySelector('.chat-container');
    let scrollTimeout;
    chatContainer.addEventListener('scroll', () => {
        isUserScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isUserScrolling = false;
        }, 200);
    });

    // Обработчики отправки сообщений
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Обработчики для изменения никнейма
    changeNicknameBtn.addEventListener('click', openNicknameModal);
    closeModalBtn.addEventListener('click', closeNicknameModal);
    
    // Закрытие модального окна при клике вне его
    nicknameModal.addEventListener('click', (e) => {
        if (e.target === nicknameModal) {
            closeNicknameModal();
        }
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nicknameModal.classList.contains('show')) {
            closeNicknameModal();
        }
    });
    
    // Сохранение никнейма
    saveNicknameBtn.addEventListener('click', () => {
        changeNickname(newNicknameInput.value);
    });
    
    // Генерация случайного никнейма
    generateNicknameBtn.addEventListener('click', () => {
        const randomNickname = generateRandomNickname();
        newNicknameInput.value = randomNickname;
        newNicknameInput.focus();
        newNicknameInput.select();
    });
    
    // Сохранение по Enter в поле ввода никнейма
    newNicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            changeNickname(newNicknameInput.value);
        }
    });

    // Слушатель всех сообщений (для начальной загрузки и новых)
    if (messagesRef) {
        console.log('Подключение слушателя сообщений...');
        window.firebaseApp.onChildAdded(messagesRef, (snapshot) => {
            handleMessageAdded(snapshot);
        }, (error) => {
            console.error('Ошибка при чтении сообщений:', error);
            alert('Ошибка чтения сообщений: ' + error.message);
        });
    } else {
        console.error('messagesRef не инициализирован, слушатель не подключен');
    }
}

// Запускаем инициализацию Firebase
if (window.firebaseReady) {
    initFirebase();
} else {
    window.addEventListener('firebaseReady', initFirebase, { once: true });
}
