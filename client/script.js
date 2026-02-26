// 1. Inicializimi dhe Lidhja
const socket = io('https://zion-71-server.onrender.com'); // Sigurohu që kjo lidhet me serverin tënd
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
let myName = localStorage.getItem('zion_player_name');
if (!myName) {
    myName = prompt("Shkruaj emrin tënd:");
    if (myName) localStorage.setItem('zion_player_name', myName);
}
socket.emit('joinGame', myName);

// 2. Logjika e Fillimit të Lojës
btnStart.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('receiveCards', (cards) => {
    document.getElementById('lobby-controls').style.display = 'none';
    handContainer.innerHTML = '';
    doraImeData = cards; 
    
    cards.forEach(card => {
        handContainer.appendChild(createCard(card.v, card.s));
    });
    
    checkMbylljaButton();
});

socket.on('gameStarted', (data) => {
    const jackpotDiv = document.getElementById('jackpot');
    jackpotDiv.innerHTML = `${data.jackpot.v}<br>${data.jackpot.s}`;
    if(data.jackpot.s === '♥' || data.jackpot.s === '♦') jackpotDiv.style.color = 'red';
});

// 3. Menaxhimi i Rradhës
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
    
    if (isMyTurn) {
        // Rregulli: Nëse ke 11 letra në fillim, je ndarësi që duhet të hedhë një letër
        hasDrawnCard = (doraImeData.length === 11);
    }
    
    checkMbylljaButton();
    updateTurnUI();
});

function updateTurnUI() {
    if (isMyTurn) {
        document.body.classList.add('active-turn-glow');
        deckElement.classList.add('active-deck');
    } else {
        document.body.classList.remove('active-turn-glow');
        deckElement.classList.remove('active-deck');
    }
}

// 4. Marrja e Letrës
deckElement.addEventListener('click', () => {
    if (!isMyTurn) return alert("Nuk është radha jote!");
    if (hasDrawnCard) return alert("E more një letër, tani duhet të hedhësh një ose të mbyllësh!");
    socket.emit('drawCard');
});

socket.on('cardDrawn', (card) => {
    hasDrawnCard = true;
    doraImeData.push(card);
    const newCard = createCard(card.v, card.s);
    handContainer.appendChild(newCard);
    newCard.style.animation = "pullCard 0.5s ease-out";
    checkMbylljaButton();
});

// 5. Krijimi i Letrës dhe Drag & Drop
function createCard(v, s) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.draggable = true;
    cardDiv.innerHTML = `${v}<br>${s}`;
    cardDiv.dataset.v = v; 
    cardDiv.dataset.s = s;
    if(s === '♥' || s === '♦') cardDiv.style.color = 'red';

    cardDiv.addEventListener('dragstart', () => cardDiv.classList.add('dragging'));
    cardDiv.addEventListener('dragend', () => cardDiv.classList.remove('dragging'));

    return cardDiv;
}

handContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const draggingCard = document.querySelector('.dragging');
    const afterElement = getDragAfterElement(handContainer, e.clientX);
    if (afterElement == null) handContainer.appendChild(draggingCard);
    else handContainer.insertBefore(draggingCard, afterElement);
});

// Hedhja e letrës (Discard)
discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', () => {
    if (!isMyTurn) return alert("Nuk është radha jote!");
    if (!hasDrawnCard) return alert("Duhet të marrësh një letër te stiva para se të hedhësh!");

    const draggingCard = document.querySelector('.dragging');
    const v = draggingCard.dataset.v;
    const s = draggingCard.dataset.s;

    if (v === '★') return alert("Xhokeri nuk mund të hidhet!");

    // Hiq letrën nga dora (logjika)
    const index = doraImeData.findIndex(c => c.v === v && c.s === s);
    if (index > -1) doraImeData.splice(index, 1);

    // Vizuale
    const randomRotate = Math.floor(Math.random() * 40) - 20;
    draggingCard.style.transform = `rotate(${randomRotate}deg)`;
    discardPile.appendChild(draggingCard);
    
    hasDrawnCard = false; 
    isMyTurn = false; 
    checkMbylljaButton(); 
    socket.emit('endTurn'); 
});

// 6. Logjika e Butonit Mbyll (Sipas Rregullit 7)
function checkMbylljaButton() {
    // Shfaqet vetëm nëse ke 11 letra (9 + Xhoker + 1 për të hedhur)
    if (isMyTurn && doraImeData.length === 11) {
        btnMbyll.style.display = 'block';
        btnMbyll.classList.add('glow-green'); // Rregulluar bug-u btnMall
    } else {
        btnMbyll.style.display = 'none';
        btnMbyll.classList.remove('glow-green');
    }
}

btnMbyll.addEventListener('click', () => {
    if (!isMyTurn) return alert("Nuk mund të mbyllësh lojën jashtë rradhës!");
    if (doraImeData.length < 11) return alert("Duhet të kesh 11 letra për të mbyllur!");
    
    let isFlush = confirm("A është kjo mbyllje FLUSH (2x pikë për të tjerët)?");
    socket.emit('playerClosed', { isFlush: isFlush });
    btnMbyll.style.display = 'none';
});

socket.on('roundOver', (data) => {
    let piket = llogaritPiket(doraImeData);
    // Nëse dikush tjetër mbylli me FLUSH, pikët e mia dyfishohen
    if (data.isFlush && data.winnerId !== socket.id) {
        piket *= 2;
    }
    
    socket.emit('submitMyPoints', { points: piket });
    alert(`Raundi mbaroi! Fituesi: ${data.winnerName}. More ${piket} pikë.`);
});

// 8. Logjika e Pikëve (Sipas Rregullit 8)
function llogaritPiket(cards) {
    return cards.reduce((acc, card) => {
        if (card.v === '★' || card.v === 'X') return acc + 0; // Xhokeri 0 pikë
        if (['10', 'J', 'Q', 'K', 'A'].includes(card.v)) return acc + 10; // Figurat dhe 10-shi vlen 10
        return acc + parseInt(card.v); // 2-9 sipas vlerës
    }, 0);
}

// Chat
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');

btnSend.addEventListener('click', () => {
    if (chatInput.value.trim()) {
        socket.emit('sendMessage', { user: myName, text: chatInput.value });
        chatInput.value = '';
    }
});

socket.on('receiveMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chat-msg');
    msgDiv.innerHTML = `<b>${data.user}:</b> ${data.text}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
