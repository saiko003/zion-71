const socket = io('https://zion-71.onrender.com');
const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const btnMbyll = document.getElementById('btn-mbyll');
const scoreBody = document.getElementById('score-body');

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

// Fillimi i lojes
document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('receiveCards', (cards) => {
    document.getElementById('lobby-controls').style.display = 'none';
    doraImeData = cards;
    renderHand();
    checkTurnLogic();
});

socket.on('updateGameState', (data) => {
    scoreBody.innerHTML = '';
    data.players.forEach(player => {
        const row = document.createElement('tr');
        if (player.id === data.activePlayerId) row.className = 'active-row';
        row.innerHTML = `
            <td>${player.name} ${player.id === socket.id ? '(Ti)' : ''}</td>
            <td>${player.score}</td>
            <td>${player.id === data.activePlayerId ? '●' : ''}</td>
        `;
        scoreBody.appendChild(row);
    });

    isMyTurn = (data.activePlayerId === socket.id);
    checkTurnLogic();
    updateTurnUI();
});

function checkTurnLogic() {
    // Fillimtari ka 11 letra, te tjeret 10. Kush ka 11 e ka "te terhequr" letren.
    hasDrawnCard = (doraImeData.length === 11);
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
    if (!isMyTurn || !hasDrawnCard) return;

    const draggingCard = document.querySelector('.dragging');
    const content = draggingCard.innerHTML.split('<br>');
    const v = content[0];
    const s = content[1];

    if (v === '★') return alert("Xhokeri nuk hidhet!");

    const idx = doraImeData.findIndex(c => c.v === v && c.s === s);
    if (idx > -1) {
        doraImeData.splice(idx, 1);
        renderHand();
        isMyTurn = false;
        socket.emit('endTurn');
    }
});

btnMbyll.addEventListener('click', () => {
    if (confirm("A i ke ndrequr letrat? (Mbyllje FLUSH?)")) {
        socket.emit('playerClosed', { isFlush: true });
    } else {
        socket.emit('playerClosed', { isFlush: false });
    }
});

socket.on('roundOver', (data) => {
    let p = llogaritPiket(doraImeData);
    socket.emit('submitMyPoints', { points: p });
    alert(`Raundi u mbyll nga ${data.winnerName}!`);
});

function llogaritPiket(cards) {
    return cards.reduce((acc, c) => {
        if (c.v === 'A') return acc + 11;
        if (['K', 'Q', 'J'].includes(c.v)) return acc + 10;
        if (c.v === '★') return acc + 0;
        return acc + (parseInt(c.v) || 0);
    }, 0);
}

function updateTurnUI() {
    document.body.style.boxShadow = isMyTurn ? "inset 0 0 50px #27ae60" : "none";
}
