const socket = io('https://zion-71.onrender.com');
const handContainer = document.getElementById('player-hand');
const discardPile = document.getElementById('discard-pile');
const deckElement = document.getElementById('deck');
const jackpotElement = document.getElementById('jackpot');
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

// ZËVENDËSOJE ME KËTË:
document.getElementById('btn-start').addEventListener('click', () => {
    // Kjo kërkon që ekrani të bëhet Fullscreen (Heq shiritat e browser-it)
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) { /* Për iPhone/Safari */
        document.documentElement.webkitRequestFullscreen();
    }
    
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
    // Përditëso Scoreboard
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

    // Përditëso Jackpot-in vizualisht nëse ka ardhur nga serveri
    if (data.jackpotCard) {
        jackpotElement.innerHTML = `${data.jackpotCard.v}<br>${data.jackpotCard.s}`;
        if (['♥', '♦'].includes(data.jackpotCard.s)) jackpotElement.style.color = 'red';
        else jackpotElement.style.color = 'black';
        jackpotElement.style.display = 'block';
    } else {
        jackpotElement.innerHTML = '';
        jackpotElement.style.display = 'none';
    }

    isMyTurn = (data.activePlayerId === socket.id);
    checkTurnLogic();
    updateTurnUI();
});

// PËRMIRËSUAR: Logjika e kontrollit të letrave
function checkTurnLogic() {
    // Nëse dora ka 10 letra, do të thotë nuk kemi tërhequr akoma për këtë radhë
    if (doraImeData.length <= 10) {
        hasDrawnCard = false;
    } else {
        hasDrawnCard = true;
    }

    btnMbyll.style.display = (isMyTurn && doraImeData.length === 11) ? 'block' : 'none';
    updateAsistenti();
}

// RENDITJA DHE RREGULLIMI I LETRAVE (UPDATE 18)
function renderHand() {
    handContainer.innerHTML = '';
    doraImeData.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.draggable = true;
        div.dataset.index = index;
        div.innerHTML = `${card.v}<br>${card.s}`;
        if(card.s === '♥' || card.s === '♦') div.style.color = 'red';
        
        // Fillimi i tërheqjes
        div.addEventListener('dragstart', (e) => {
            div.classList.add('dragging');
            e.dataTransfer.setData('text/plain', index);
        });

        // Lëvizja mbi letrat e tjera (Reordering)
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard || draggingCard.parentElement !== handContainer) return;

            const cards = [...handContainer.querySelectorAll('.card:not(.dragging)')];
            const nextCard = cards.find(c => {
                const box = c.getBoundingClientRect();
                return e.clientX <= box.left + box.width / 2;
            });

            if (nextCard) handContainer.insertBefore(draggingCard, nextCard);
            else handContainer.appendChild(draggingCard);
        });

        // Lëshimi i letrës
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            // Ruajmë renditjen e re në array
            const currentCards = [...handContainer.querySelectorAll('.card')];
            doraImeData = currentCards.map(c => {
                const parts = c.innerHTML.split('<br>');
                return { v: parts[0], s: parts[1] };
            });
            updateAsistenti();
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

        // 1. Provo GRUP
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

        // 2. Provo RRESHT
        for (let size = 3; size <= 10; size++) {
            let currentJ = jLeft;
            let tempNext = [...remaining];
            let possible = true;
            
            for (let v = first.v; v < first.v + size; v++) {
                let foundIdx = tempNext.findIndex(c => c.v === v && c.s === first.s);
                if (foundIdx > -1) tempNext.splice(foundIdx, 1);
                else if (currentJ > 0) currentJ--;
                else { possible = false; break; }
            }
            if (possible && solve(tempNext, currentJ)) return true;
        }
        return false;
    }
    return solve(normalCards, jokers);
}

function updateAsistenti() {
    let ready = false;
    if (doraImeData.length === 11) {
        // 1. Kontrolli Normal (Kombinime)
        for (let i = 0; i < doraImeData.length; i++) {
            let testHand = doraImeData.filter((_, idx) => idx !== i);
            if (validateZionHand(testHand)) {
                ready = true;
                break;
            }
        }

        // 2. Kontrolli FLUSH (Të gjitha një simbol - nuk ka rëndësi renditja)
        const firstSymbolCard = doraImeData.find(c => c.v !== '★');
        if (firstSymbolCard) {
            const isFlush = doraImeData.every(c => c.v === '★' || c.s === firstSymbolCard.s);
            if (isFlush) ready = true;
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

// UPDATE: Kontrolli i fortë për stivën (Deck)
deckElement.addEventListener('click', () => {
    if (!isMyTurn) return;

    // Nëse ke 10 letra, merr letrën normalisht
    if (doraImeData.length === 10) {
        socket.emit('drawCard');
    } 
    // NËSE MBETESH I BLLOKUAR (p.sh. ke 11 ose më pak se 10 gabimisht)
    else {
        console.log("Sync error: Ti ke " + doraImeData.length + " letra.");
        // Kjo i thotë serverit: "Më dërgo prapë letrat e mia se jam bllokuar"
        socket.emit('requestMyCards'); 
    }
});

// UPDATE: Jackpot me mbyllje automatike (Flush) + FIX TIMEOUT
jackpotElement.addEventListener('click', () => {
    if (!isMyTurn || doraImeData.length !== 10) {
        alert("Jackpot merret vetëm si letra e 11-të kur po mbyll lojën!");
        return;
    }

    const parts = jackpotElement.innerHTML.split('<br>');
    const jackpotCard = { v: parts[0], s: parts[1] };

    const matchingCards = doraImeData.filter(card => card.v === '★' || card.s === jackpotCard.s);

    if (matchingCards.length >= 9) {
        doraImeData.push(jackpotCard);
        
        const discardIdx = doraImeData.findIndex(card => card.v !== '★' && card.s !== jackpotCard.s);
        
        let cardToDiscard;
        if (discardIdx > -1) {
            cardToDiscard = doraImeData.splice(discardIdx, 1)[0];
        } else {
            cardToDiscard = doraImeData.splice(0, 1)[0];
        }

        renderHand();
        
        socket.emit('drawJackpot');
        // Shtojmë vonesë të vogël që serveri të procesojë rradhën para mbylljes
        setTimeout(() => {
            socket.emit('cardDiscarded', cardToDiscard);
            socket.emit('playerClosed', { isFlush: true, hand: doraImeData });
        }, 100);
        
        alert("MBYLLJE FLUSH AUTOMATIKE!");
    } else {
        alert("Jackpot-in mund ta marrësh vetëm nëse të gjitha letrat (përveç njërës që do hidhet) kanë simbolin: " + jackpotCard.s);
    }
});

socket.on('cardDrawn', (card) => {
    doraImeData.push(card);
    renderHand();
    checkTurnLogic();
});

socket.on('jackpotDrawn', (card) => {
    doraImeData.push(card);
    renderHand();
    checkTurnLogic();
});

discardPile.addEventListener('dragover', e => e.preventDefault());
discardPile.addEventListener('drop', (e) => {
    e.preventDefault(); 
    if (!isMyTurn || doraImeData.length < 11) return;
    
    const draggingCard = document.querySelector('.dragging');
    if (!draggingCard) return;

    const parts = draggingCard.innerHTML.split('<br>');
    const val = parts[0];
    const suit = parts[1];

    if (val === '★') return alert("Xhokeri nuk hidhet!");

    const idx = doraImeData.findIndex(c => c.v === val && c.s === suit);
    if (idx > -1) {
        const cardDiscarded = { v: val, s: suit }; 
        doraImeData.splice(idx, 1);
        renderHand();
        
        isMyTurn = false;
        hasDrawnCard = false;
        
        socket.emit('cardDiscarded', cardDiscarded); 
        socket.emit('endTurn');
        
        updateTurnUI();
        checkTurnLogic();
    }
});

// UPDATE: Butoni mbyll me FIX TIMEOUT
btnMbyll.addEventListener('click', () => {
    let ready = false;
    let isFlushWin = false;
    let finalHand = [];
    let autoDiscard = null;
    
    for (let i = 0; i < doraImeData.length; i++) {
        let testHand = doraImeData.filter((_, idx) => idx !== i);
        const firstSymbol = testHand.find(c => c.v !== '★');
        if (firstSymbol) {
            const isFlush = testHand.every(c => c.v === '★' || c.s === firstSymbol.s);
            if (isFlush) {
                isFlushWin = true;
                ready = true;
                autoDiscard = doraImeData[i];
                finalHand = testHand;
                break;
            }
        }
    }

    if (!ready) {
        for (let i = 0; i < doraImeData.length; i++) {
            let testHand = doraImeData.filter((_, idx) => idx !== i);
            if (validateZionHand(testHand)) {
                ready = true;
                autoDiscard = doraImeData[i];
                finalHand = testHand;
                break;
            }
        }
    }

    if (ready) {
        socket.emit('cardDiscarded', autoDiscard);
        // Shtojmë vonesë që serveri të pranojë letrën e hedhur para se të mbyllë dhomën
        setTimeout(() => {
            socket.emit('playerClosed', { isFlush: isFlushWin, hand: finalHand });
        }, 100);
    } else {
        alert("Dora nuk është e vlefshme për mbyllje!");
    }
});

socket.on('roundOver', (data) => {
    const winnerOverlay = document.createElement('div');
    winnerOverlay.id = "winner-reveal-overlay";
    winnerOverlay.innerHTML = `
        <div class="winner-content">
            <h2 style="color: gold; margin-bottom: 10px;">🏆 ${data.winnerName} MBYLLI LOJËN!</h2>
            <p style="margin-bottom: 15px;">${data.isFlush ? "🔥 MBYLLJE FLUSH (x2 PIKË)" : "Mbyllje Normale"}</p>
            <div id="winning-cards-showcase" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;"></div>
            <p style="margin-top: 15px; font-size: 0.8rem; opacity: 0.7;">Raundi i ri fillon pas pak...</p>
        </div>
    `;
    document.body.appendChild(winnerOverlay);

    const showcase = document.getElementById('winning-cards-showcase');
    if (data.winningHand) {
        data.winningHand.forEach(card => {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'card mini';
            cardDiv.style.width = "50px";
            cardDiv.style.height = "75px";
            cardDiv.style.fontSize = "0.9rem";
            cardDiv.innerHTML = `${card.v}<br>${card.s}`;
            if (['♥', '♦'].includes(card.s)) cardDiv.style.color = 'red';
            showcase.appendChild(cardDiv);
        });
    }

    let p = 0;
    if (data.winnerId !== socket.id) {
        p = llogaritPiket(doraImeData);
    }
    
    socket.emit('submitMyPoints', { points: p, isFlush: data.isFlush });

    setTimeout(() => {
        winnerOverlay.remove();
    }, 5000);
});

function llogaritPiket(cards) {
    return cards.reduce((acc, c) => {
        if (c.v === 'A') return acc + 11;
        if (['K', 'Q', 'J'].includes(c.v)) return acc + 10;
        if (c.v === '★') return acc + 0;
        return acc + (parseInt(c.v) || 0);
    }, 0);
}

// UPDATE: UI Përmirësim vizual për Deck
function updateTurnUI() {
    document.body.style.boxShadow = isMyTurn ? "inset 0 0 50px #27ae60" : "none";
    
    if(isMyTurn && doraImeData.length === 10) {
        deckElement.classList.add('active-deck');
        deckElement.style.opacity = "1";
    } else {
        deckElement.classList.remove('active-deck');
        deckElement.style.opacity = "0.7";
    }

    if(isMyTurn && doraImeData.length === 10) jackpotElement.classList.add('glow-jackpot');
    else jackpotElement.classList.remove('glow-jackpot');
}

// --- LOGJIKA E CHAT-IT ---

// --- LOGJIKA E PLOTË E CHAT-IT ---
const chatInput = document.getElementById('chat-input'); 
const btnSendChat = document.getElementById('btn-send-chat');
const chatMessages = document.getElementById('chat-messages');

if (btnSendChat && chatInput) {
    // Dërgimi me klikim të butonit
    btnSendChat.addEventListener('click', () => {
        const msg = chatInput.value.trim();
        if (msg !== "") {
            // Dërgojmë mesazhin te serveri
            socket.emit('sendMessage', { 
                name: typeof myName !== 'undefined' ? myName : "Lojtar", 
                message: msg 
            });
            chatInput.value = ""; // Pastrojmë fushën
        }
    });

    // Dërgimi me butonin Enter nga tastiera
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnSendChat.click();
        }
    });
}

// Marrja e mesazheve nga serveri
socket.on('receiveMessage', (data) => {
    if (chatMessages) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-entry'; 
        msgDiv.innerHTML = `<strong>${data.name}:</strong> ${data.message}`;
        
        chatMessages.appendChild(msgDiv);
        
        // Auto-scroll në fund të chat-it
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// ... këtu mbaron kodi yt i vjetër (p.sh. socket.on('receiveMessage', ...))

// ==========================================
// 1. KJO ZGJIDH PROBLEMIN E TELEFONIT (Vendose këtu)
// ==========================================
const touchHandler = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('pointerdown', (e) => {
            el.click(); 
        }, { passive: false });
    }
};

touchHandler('deck');
touchHandler('jackpot');
touchHandler('discard-pile');
touchHandler('btn-start');
touchHandler('btn-mbyll');
touchHandler('btn-send-chat');

const playerHand = document.getElementById('player-hand');
if (playerHand) {
    playerHand.addEventListener('pointerdown', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            card.click();
        }
    }, { passive: false });
}

// ==========================================
// 2. BLOKIMI I SCROLL-IT (Krejt në fund)
// ==========================================
window.addEventListener('scroll', () => {
    window.scrollTo(0, 0);
}, { passive: false });
