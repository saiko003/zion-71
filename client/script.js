// 1. Inicializimi dhe Lidhja
const socket = io('https://zion-71.onrender.com');
const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const jackpotElement = document.getElementById('jackpot');
const btnStart = document.getElementById('btn-start');
const btnMbyll = document.getElementById('btn-mbyll');

let isMyTurn = false;
let hasDrawnCard = false; // Rregull: Duhet te terheqesh leter para se te hedhesh
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
    if (isMyTurn) hasDrawnCard = false; // Resetohet ne fillim te rradhes
    updateTurnUI();
});

function updateTurnUI() {
    if (isMyTurn) {
        document.body.style.boxShadow = "inset 0 0 50px #27ae60";
        deckElement.classList.add('active-deck');
    } else {
        document.body.style.boxShadow = "none";
        deckElement.classList.remove('active-deck');
    }
}

// 4. Marrja e Letrës
deckElement.addEventListener('click', () => {
    if (!isMyTurn) return alert("Nuk është radha jote!");
    if (hasDrawnCard) return alert("E more një letër, tani duhet të hedhësh një!");
    socket.emit('drawCard');
});

socket.on('cardDrawn', (card) => {
    hasDrawnCard = true;
    doraImeData.push(card);
    const newCard = createCard(card.v, card.s);
    handContainer.appendChild(newCard);
    newCard.style.animation = "pullCard 0.5s ease-out";
    checkCombinations();
});

// 5. Krijimi i Letrës dhe Drag & Drop
function createCard(v, s) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.draggable = true;
    cardDiv.innerHTML = `${v}<br>${s}`;
    cardDiv.dataset.v = v; // Ruajme vleren ne dataset per drop-in
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

// Hedhja e letrës (Discard) - KETU BEME NDRYSHIMET KRYESORE
discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', () => {
    if (!isMyTurn) return alert("Nuk është radha jote!");
    if (!hasDrawnCard) return alert("Duhet të marrësh një letër te stiva para se të hedhësh!");

    const draggingCard = document.querySelector('.dragging');
    const v = draggingCard.dataset.v;
    const s = draggingCard.dataset.s;

    if (v === '★') return alert("Xhokeri nuk mund të hidhet!");

    // Hiq letran nga dora (memorja)
    const index = doraImeData.findIndex(c => c.v === v && c.s === s);
    if (index > -1) doraImeData.splice(index, 1);

    // Vizuale
    const randomRotate = Math.floor(Math.random() * 40) - 20;
    draggingCard.style.transform = `rotate(${randomRotate}deg)`;
    discardPile.appendChild(draggingCard);
    
    isMyTurn = false; // Bllokohet menjehere deri ne njoftimin tjeter
    socket.emit('endTurn'); 
});

// 6. Mbyllja dhe Pikët
function checkCombinations() {
    const cards = handContainer.querySelectorAll('.card');
    if (cards.length >= 10) {
        btnMbyll.style.display = 'block';
        btnMbyll.classList.add('glow-green');
    } else {
        btnMbyll.style.display = 'none';
    }
}

btnMbyll.addEventListener('click', () => {
    if (!isMyTurn) return alert("Nuk mund të mbyllësh lojën jashtë rradhës!");
    let isFlush = confirm("A është kjo mbyllje FLUSH (pa asnjë letër jashtë)?");
    socket.emit('playerClosed', { isFlush: isFlush });
    btnMbyll.style.display = 'none';
});

socket.on('roundOver', (data) => {
    let piket = llogaritPiket(doraImeData);
    if (data.isFlush) piket *= 2;
    
    socket.emit('submitMyPoints', { points: piket });
    alert(`Raundi mbaroi! Fituesi: ${data.winnerName}. More ${piket} pikë.`);
});

function llogaritPiket(cards) {
    return cards.reduce((acc, card) => {
        if (card.v === 'A') return acc + 11;
        if (['K', 'Q', 'J'].includes(card.v)) return acc + 10;
        if (card.v === 'X' || card.v === '★') return acc + 0;
        return acc + parseInt(card.v);
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
