const socket = io('https://zion-71.onrender.com');
const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const btnMbyll = document.getElementById('btn-mbyll');
const scoreBody = document.getElementById('score-body');
const asistentiContainer = document.getElementById('asistenti-container');
const statusDrita = document.getElementById('status-drita');
const statusTeksti = document.getElementById('status-teksti');

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
    asistentiContainer.style.display = 'flex';
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
    hasDrawnCard = (doraImeData.length === 11);
    btnMbyll.style.display = (isMyTurn && doraImeData.length === 11) ? 'block' : 'none';
    updateAsistenti();
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
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            updateAsistenti(); // Kontrollo kur lojtari i rregullon letrat
        });
        handContainer.appendChild(div);
    });
}

// --- ALGORITMI I KONTROLLIT ZION 71 ---

function validateZionHand(cards) {
    if (cards.length !== 10) return false;

    const valMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    let jokers = cards.filter(c => c.v === '★').length;
    let normalCards = cards.filter(c => c.v !== '★').map(c => ({
        v: valMap[c.v],
        s: c.s
    })).sort((a, b) => a.v - b.v);

    function solve(remaining, jLeft) {
        if (remaining.length === 0) return true;

        let first = remaining[0];

        // 1. Provo GRUP (Vlera e njejte)
        for (let size = 3; size <= 4; size++) {
            let sameVal = remaining.filter(c => c.v === first.v);
            for (let use = 1; use <= Math.min(sameVal.length, size); use++) {
                let jNeeded = size - use;
                if (jNeeded <= jLeft) {
                    let next = [...remaining];
                    for(let i=0; i<use; i++) {
                        let idx = next.findIndex(c => c.v === first.v);
                        next.splice(idx, 1);
                    }
                    if (solve(next, jLeft - jNeeded)) return true;
                }
            }
        }

        // 2. Provo RRESHT (Sekuence)
        let sameSuit = remaining.filter(c => c.s === first.s);
        if (sameSuit.length >= 1) {
            for (let size = 3; size <= 10; size++) {
                let sequence = [];
                let currentJ = jLeft;
                let tempNext = [...remaining];
                
                // Provo te ndertosh rresht duke nisur nga 'first'
                for (let v = first.v; v < first.v + size; v++) {
                    let foundIdx = tempNext.findIndex(c => c.v === v && c.s === first.s);
                    if (foundIdx > -1) {
                        tempNext.splice(foundIdx, 1);
                    } else if (currentJ > 0) {
                        currentJ--;
                    } else {
                        sequence = null; break;
                    }
                }
                if (sequence !== null && solve(tempNext, currentJ)) return true;
            }
        }
        return false;
    }
    return solve(normalCards, jokers);
}

function updateAsistenti() {
    let ready = false;
    if (doraImeData.length === 11) {
        // Shikon nese hedhja e ndonje letre lene 10 letra te rregullta
        for (let i = 0; i < doraImeData.length; i++) {
            let testHand = doraImeData.filter((_, idx) => idx !== i);
            if (validateZionHand(testHand)) {
                ready = true;
                break;
            }
        }
    }

    if (ready) {
        statusDrita.className = 'led-green';
        statusTeksti.innerText = "Dora është gati!";
        btnMbyll.classList.add('glow-green-intense');
    } else {
        statusDrita.className = 'led-red';
        statusTeksti.innerText = doraImeData.length === 11 ? "Rregullo letrat..." : "Prit rradhën...";
        btnMbyll.classList.remove('glow-green-intense');
    }
}

// --- EVENTET ---

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
    if (content[0] === '★') return alert("Xhokeri nuk hidhet!");

    const idx = doraImeData.findIndex(c => c.v === content[0] && c.s === content[1]);
    if (idx > -1) {
        doraImeData.splice(idx, 1);
        renderHand();
        isMyTurn = false;
        socket.emit('endTurn');
    }
});

btnMbyll.addEventListener('click', () => {
    let isFlush = confirm("A është mbyllje FLUSH?");
    socket.emit('playerClosed', { isFlush });
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
