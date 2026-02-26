const socket = io('https://zion-71.onrender.com');
const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const btnMbyll = document.getElementById('btn-mbyll');

let isMyTurn = false;
let hasDrawnCard = false;
let doraImeData = [];

socket.emit('joinGame', localStorage.getItem('zion_player_name') || prompt("Emri:"));

socket.on('receiveCards', (cards) => {
    doraImeData = cards;
    renderHand();
    checkTurnLogic();
});

socket.on('updateGameState', (data) => {
    isMyTurn = (data.activePlayerId === socket.id);
    checkTurnLogic();
    // Përditëso UI e rradhës këtu (ngjyrat, etj)
});

function checkTurnLogic() {
    // Nëse ke 11 letra, sistemi e konsideron që "ke tërhequr" letër (ose je fillimtar)
    hasDrawnCard = (doraImeData.length === 11);
    
    // Shfaq butonin mbyll vetëm nëse ke 11 letra dhe është rradha jote
    btnMbyll.style.display = (isMyTurn && doraImeData.length === 11) ? 'block' : 'none';
}

function renderHand() {
    handContainer.innerHTML = '';
    doraImeData.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card';
        div.draggable = true;
        div.innerHTML = `${card.v}<br>${card.s}`;
        if(card.s === '♥' || card.s === '♦') div.style.color = 'red';
        
        div.addEventListener('dragstart', () => div.classList.add('dragging'));
        div.addEventListener('dragend', () => div.classList.remove('dragging'));
        handContainer.appendChild(div);
    });
}

deckElement.addEventListener('click', () => {
    if (!isMyTurn || hasDrawnCard) return;
    socket.emit('drawCard');
});

socket.on('cardDrawn', (card) => {
    doraImeData.push(card);
    renderHand();
    checkTurnLogic();
});

discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', () => {
    if (!isMyTurn || !hasDrawnCard) return alert("Nuk lejohet!");
    
    const draggingCard = document.querySelector('.dragging');
    // Hiq letrën nga array doraImeData bazuar në tekstin e div-it
    const [v, s] = draggingCard.innerText.split('\n');
    const idx = doraImeData.findIndex(c => c.v === v && c.s === s);
    
    if (idx > -1) {
        doraImeData.splice(idx, 1);
        renderHand();
        isMyTurn = false;
        socket.emit('endTurn');
    }
});

btnMbyll.addEventListener('click', () => {
    socket.emit('playerClosed', { isFlush: confirm("Flush?") });
});

socket.on('roundOver', (data) => {
    const p = doraImeData.reduce((a, c) => a + (parseInt(c.v) || 10), 0);
    socket.emit('submitMyPoints', { points: p });
    alert(`Fitues: ${data.winnerName}`);
});
