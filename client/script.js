// ============================
// script.js – ZION 71 (Updated)
// ============================

// 1️⃣ Inicializimi dhe Lidhja me Socket
const SERVER_URL = 'https://zion-71.onrender.com'; // **URL e saktë nga Render**
const socket = io(SERVER_URL, { transports: ['websocket'] });

const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const jackpotElement = document.getElementById('jackpot');
const btnStart = document.getElementById('btn-start');
const btnMbyll = document.getElementById('btn-mbyll');

let isMyTurn = false;
let hasDrawnCard = false; 
let doraImeData = []; 

// Ruajtja e emrit dhe dërgimi te serveri
let myName = localStorage.getItem('zion_player_name');
if (!myName) {
    myName = prompt("Shkruaj emrin tënd:");
    if (myName) localStorage.setItem('zion_player_name', myName);
}

// 2️⃣ Lidhja me server dhe join
socket.on('connect', () => {
    console.log("✅ U lidha me serverin!");
    if (myName) socket.emit('joinGame', { name: myName });
});

// Debug connection error
socket.on('connect_error', (err) => {
    console.error("⚠️ Socket connection error:", err);
});

// ============================
// START GAME BUTTON
// ============================
btnStart.addEventListener('click', () => {
    console.log("📤 Po dërgoj startGame");
    socket.emit('startGame');
});

// ============================
// RECEIVE INITIAL CARDS
// ============================
socket.on('receiveCards', (cards) => {
    doraImeData = cards;
    handContainer.innerHTML = '';
    cards.forEach(card => handContainer.appendChild(createCard(card.v, card.s)));
    checkMbylljaButton();

    // Hide lobby
    const lobby = document.getElementById('lobby-controls');
    if (lobby) lobby.style.display = 'none';
});

// ============================
// GAME STARTED – JACKPOT
// ============================
socket.on('gameStarted', (data) => {
    jackpotElement.innerHTML = `${data.jackpot.v}<br>${data.jackpot.s}`;
    jackpotElement.style.color = (data.jackpot.s === '♥' || data.jackpot.s === '♦') ? 'red' : 'black';
});

// ============================
// UPDATE GAME STATE
// ============================
socket.on('updateGameState', (data) => {
    const scoreBody = document.getElementById('score-body');
    scoreBody.innerHTML = '';

    data.players.forEach(player => {
        const row = document.createElement('tr');
        if (player.id === data.activePlayerId) row.className = 'active-row';
        if (player.score >= 71) row.classList.add('eliminated');

        row.innerHTML = `
            <td>${player.name} ${player.id === socket.id ? '(Ti)' : ''}</td>
            <td>${player.score}</td>
            <td>${player.id === data.activePlayerId ? '●' : ''}</td>
        `;
        scoreBody.appendChild(row);
    });

    isMyTurn = (data.activePlayerId === socket.id);
    if (isMyTurn) hasDrawnCard = (doraImeData.length === 11);

    checkMbylljaButton();
    updateTurnUI();
});

// ============================
// UPDATE TURN UI
// ============================
function updateTurnUI() {
    if (isMyTurn) {
        document.body.classList.add('active-turn-glow');
        deckElement.classList.add('active-deck');
    } else {
        document.body.classList.remove('active-turn-glow');
        deckElement.classList.remove('active-deck');
    }
}

// ============================
// DRAW CARD
// ============================
deckElement.addEventListener('click', () => {
    if (!isMyTurn) return alert("Sot nuk është radha jote!");
    if (hasDrawnCard) return alert("E more një letër, hidh një tjetër!");
    console.log("📤 Po kërkoj të marrë një letër");
    socket.emit('drawCard');
});

socket.on('cardDrawn', (card) => {
    hasDrawnCard = true;
    doraImeData.push(card);
    handContainer.appendChild(createCard(card.v, card.s));
    checkMbylljaButton();
});

// ============================
// CREATE CARD
// ============================
function createCard(v, s) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.draggable = true;
    cardDiv.innerHTML = `${v}<br>${s}`;
    cardDiv.dataset.v = v;
    cardDiv.dataset.s = s;
    if (s === '♥' || s === '♦') cardDiv.style.color = 'red';

    cardDiv.addEventListener('dragstart', () => cardDiv.classList.add('dragging'));
    cardDiv.addEventListener('dragend', () => cardDiv.classList.remove('dragging'));
    return cardDiv;
}

// ============================
// DRAG & DROP
// ============================
handContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const draggingCard = document.querySelector('.dragging');
    const afterElement = getDragAfterElement(handContainer, e.clientX);
    if (!afterElement) handContainer.appendChild(draggingCard);
    else handContainer.insertBefore(draggingCard, afterElement);
});

discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', () => {
    if (!isMyTurn || !hasDrawnCard) return;

    const draggingCard = document.querySelector('.dragging');
    const v = draggingCard.dataset.v;
    const s = draggingCard.dataset.s;
    if (v === '★') return alert("Xhokeri nuk hidhet!");

    const index = doraImeData.findIndex(c => c.v === v && c.s === s);
    if (index > -1) doraImeData.splice(index, 1);

    const randomRotate = Math.floor(Math.random() * 40) - 20;
    draggingCard.style.transform = `rotate(${randomRotate}deg)`;
    discardPile.appendChild(draggingCard);

    hasDrawnCard = false;
    isMyTurn = false;
    checkMbylljaButton();
    socket.emit('endTurn');
});

// ============================
// Mbyllja e dorës
// ============================
function checkMbylljaButton() {
    if (isMyTurn && doraImeData.length === 11) {
        btnMbyll.style.display = 'block';
        btnMbyll.classList.add('glow-green');
    } else {
        btnMbyll.style.display = 'none';
        btnMbyll.classList.remove('glow-green');
    }
}

btnMbyll.addEventListener('click', () => {
    if (!isMyTurn || doraImeData.length < 11) return;
    let isFlush = confirm("A është mbyllje FLUSH (Pikë x2)?");
    socket.emit('playerClosed', { isFlush });
    btnMbyll.style.display = 'none';
});

socket.on('roundOver', (data) => {
    let piket = llogaritPiket(doraImeData);
    if (data.isFlush && data.winnerId !== socket.id) piket *= 2;
    socket.emit('submitMyPoints', { points: piket });
    alert(`Raundi mbaroi! Fituesi: ${data.winnerName}. More ${piket} pikë.`);
});

function llogaritPiket(cards) {
    return cards.reduce((acc, card) => {
        if (card.v === '★' || card.v === 'X') return acc + 0;
        if (['10','J','Q','K','A'].includes(card.v)) return acc + 10;
        return acc + parseInt(card.v);
    }, 0);
}

// ============================
// CHAT
// ============================
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

btnSend.addEventListener('click', () => {
    if (!chatInput.value.trim()) return;
    socket.emit('sendMessage', { user: myName, text: chatInput.value });
    chatInput.value = '';
});

socket.on('receiveMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-msg');
    msgDiv.innerHTML = `<b>${data.user}:</b> ${data.text}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ============================
// Drag helper
// ============================
function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
