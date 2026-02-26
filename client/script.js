const socket = io('https://zion-71-server.onrender.com');

const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const jackpotElement = document.getElementById('jackpot');
const btnStart = document.getElementById('btn-start');
const btnMbyll = document.getElementById('btn-mbyll');

let isMyTurn = false;
let hasDrawnCard = false;
let doraImeData = [];

// Ruajtja e emrit
let myName = localStorage.getItem('zion_player_name') || prompt("Shkruaj emrin tënd:");
if (myName) localStorage.setItem('zion_player_name', myName);

// Lidhu me serverin
socket.on('connect', () => {
    console.log("U lidha me serverin!");
    if (myName) socket.emit('joinGame', myName);
});

// Start game
btnStart.addEventListener('click', () => {
    const lojtaretNeTabele = document.querySelectorAll('#score-body tr').length;
    if (lojtaretNeTabele < 2) return alert("Duhen të paktën 2 lojtarë për të nisur lojën!");
    socket.emit('startGame');
});

// Merr letrat
socket.on('receiveCards', (cards) => {
    const lobby = document.getElementById('lobby-controls');
    if (lobby) lobby.style.display = 'none';

    handContainer.innerHTML = '';
    doraImeData = cards;

    cards.forEach(card => handContainer.appendChild(createCard(card.v, card.s)));
    checkMbylljaButton();
});

// Game started - jackpot
socket.on('gameStarted', (data) => {
    jackpotElement.innerHTML = `${data.jackpot.v}<br>${data.jackpot.s}`;
});

// Update turn
socket.on('updateGameState', (data) => {
    const scoreBody = document.getElementById('score-body');
    scoreBody.innerHTML = '';

    data.players.forEach(player => {
        const row = document.createElement('tr');
        if (player.id === data.activePlayerId) row.className = 'active-row';
        if (player.score >= 71) row.classList.add('eliminated');
        row.innerHTML = `<td>${player.name}${player.id===socket.id?' (Ti)':''}</td>
                         <td>${player.score}</td>
                         <td>${player.id===data.activePlayerId?'●':''}</td>`;
        scoreBody.appendChild(row);
    });

    isMyTurn = (data.activePlayerId === socket.id);
    updateTurnUI();
});

// Update UI for active player
function updateTurnUI() {
    if (isMyTurn) {
        document.body.classList.add('active-turn-glow');
        deckElement.classList.add('active-deck');
        jackpotElement.classList.add('glow');
    } else {
        document.body.classList.remove('active-turn-glow');
        deckElement.classList.remove('active-deck');
        jackpotElement.classList.remove('glow');
    }
}

// Draw card
deckElement.addEventListener('click', () => {
    if (!isMyTurn || hasDrawnCard) return;
    socket.emit('drawCard');
});

socket.on('cardDrawn', (card) => {
    hasDrawnCard = true;
    doraImeData.push(card);
    handContainer.appendChild(createCard(card.v, card.s));
    checkMbylljaButton();
});

// Create card
function createCard(v, s) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.draggable = true;
    cardDiv.innerHTML = `${v}<br>${s}`;
    cardDiv.dataset.v = v;
    cardDiv.dataset.s = s;
    if(s==='♥'||s==='♦') cardDiv.classList.add('red');

    cardDiv.addEventListener('dragstart', () => cardDiv.classList.add('dragging'));
    cardDiv.addEventListener('dragend', () => cardDiv.classList.remove('dragging'));

    return cardDiv;
}

// Drag & Drop
handContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const draggingCard = document.querySelector('.dragging');
    const afterElement = getDragAfterElement(handContainer, e.clientX);
    if (afterElement == null) handContainer.appendChild(draggingCard);
    else handContainer.insertBefore(draggingCard, afterElement);
});

discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', () => {
    if (!isMyTurn || !hasDrawnCard) return;
    const draggingCard = document.querySelector('.dragging');
    const v = draggingCard.dataset.v;
    const s = draggingCard.dataset.s;

    if (v==='★') return alert("Xhokeri nuk hidhet!");

    const index = doraImeData.findIndex(c => c.v===v && c.s===s);
    if (index>-1) doraImeData.splice(index,1);

    const randomRotate = Math.floor(Math.random()*40)-20;
    draggingCard.style.transform = `rotate(${randomRotate}deg)`;
    discardPile.appendChild(draggingCard);

    hasDrawnCard = false;
    isMyTurn = false;
    checkMbylljaButton();
    socket.emit('endTurn');
});

// MBYLL button logic
function checkMbylljaButton() {
    if (isMyTurn && doraImeData.length>=10) {
        btnMbyll.style.display = 'block';
    } else {
        btnMbyll.style.display = 'none';
    }
}

btnMbyll.addEventListener('click', () => {
    if (!isMyTurn || doraImeData.length<10) return;
    const isFlush = confirm("A është mbyllje FLUSH (Pikë x2)?");
    socket.emit('playerClosed', { isFlush });
    btnMbyll.style.display = 'none';
});

// Chat
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

btnSend.addEventListener('click', () => {
    if (chatInput.value.trim()) {
        socket.emit('sendMessage', { user: myName, text: chatInput.value });
        chatInput.value='';
    }
});

socket.on('receiveMessage', data => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-msg');
    msgDiv.innerHTML = `<b>${data.user}:</b> ${data.text}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Drag helper
function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
    return draggableElements.reduce((closest, child)=>{
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width/2;
        if(offset<0 && offset>closest.offset) return {offset, element: child};
        return closest;
    },{offset:Number.NEGATIVE_INFINITY}).element;
}
