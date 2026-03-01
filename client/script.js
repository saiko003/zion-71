const socket = io('https://zion-71.onrender.com', {
    transports: ['websocket', 'polling']
});

let myName = sessionStorage.getItem('zion_player_name');

// Nëse nuk ka emër në storage, krijo një të përkohshëm
if (!myName) {
    myName = "Lojtar-" + Math.floor(Math.random() * 1000);
    sessionStorage.setItem('zion_player_name', myName);
} // Këtu duhet vetëm kllapa gjarpëruese

socket.on('connect', () => {
    const testi = "Lojtari_1"; // Emër fiks
    console.log("U lidha! Po dërgoj joinGame...");
    socket.emit('joinGame', testi);
});

const handContainer = document.getElementById('player-hand');
const jackpotElement = document.getElementById('jackpot');
const discardPile = document.getElementById('discard-pile');
const btnMbyll = document.getElementById('btn-mbyll');
const statusDrita = document.getElementById('status-drita');
const statusTeksti = document.getElementById('status-teksti');
const lobbyControls = document.getElementById('lobby-controls');
const gameTable = document.getElementById('game-table');
const deckElement = document.getElementById('deck'); 
let gameStarted = false;
let isMyTurn = false;
let doraImeData = [];
let tookJackpotThisTurn = false;

socket.on('lobbyMessage', (msg) => {
    const lobbyText = document.getElementById('lobby-text');
    if (lobbyText) lobbyText.innerText = msg;
});

const btnstart = document.getElementById('btn-start');

// 2. Kontrollojmë nëse butoni ekziston para se t'i vëmë "EventListener"
if (btnstart) {
    btnstart.addEventListener('click', () => {
        console.log("🚀 Po dërgoj startGame te serveri...");
        socket.emit('startGame');
    });
} else {
    // Kjo të ndihmon të kuptosh nëse ID-ja në HTML është e saktë
    console.error("Butoni 'btn-start' nuk u gjet në HTML!");
}

if (deckElement) {
    deckElement.onclick = () => {
        // Tërheqim letër vetëm nëse është radha jonë dhe kemi 10 letra
        if (isMyTurn && doraImeData.length === 10) {
            socket.emit('drawCard');
        } else if (doraImeData.length === 11) {
            alert("Duhet të hedhësh një letër para se të marrësh një tjetër!");
        }
    };
}

// 1. LIDHJA E KLIKIMIT TË DEKUT (ZION)
const deckZion = document.getElementById('deck-zion'); 

if (deckZion) {
    deckZion.onclick = () => {
        // Kontrollojmë: A është radha ime dhe a kam 10 letra?
        if (isMyTurn && doraImeData.length === 10) {
            socket.emit('drawCard');
            console.log("U dërgua kërkesa për të marrë letër nga deku.");
        } else if (doraImeData.length === 11) {
            alert("Ti e ke marrë letrën! Tani duhet të hedhësh një në tokë.");
        }
    };
}

socket.on('updateGameState', (data) => {
    console.log("DEBUG: gameStarted është:", data.gameStarted);

    // 1. Kontrolli i Lobby-t
    if (data.gameStarted === true) {
        if (lobbyControls) lobbyControls.style.display = 'none';
        if (gameTable) gameTable.style.display = 'block';
    } else {
        if (lobbyControls) lobbyControls.style.display = 'flex';
        if (gameTable) gameTable.style.display = 'none';
    }

    // 6. Update i Letrave (I rregulluar që të jetë më i shpejtë)
    if (data.players) {
        const me = data.players.find(p => p.id === socket.id);
        if (me && me.cards) {
            const cardsChanged = JSON.stringify(me.cards) !== JSON.stringify(doraImeData);
            if (cardsChanged) {
                doraImeData = [...me.cards];
                renderHand(); 
            }
        }
    }

    // 2. Përditëso Scoreboard
    console.log("Duke përditësuar tabelën e pikëve...");
    if (typeof updateScoreboard === "function") {
        updateScoreboard(data.players, data.activePlayerId);
    }

    // 3. Përditëso Letrën në Tokë (Discard Pile / Historia)
    const discardPileElement = document.getElementById('discard-pile');
    if (discardPileElement) {
        // Kontrollojmë nëse kemi listën e plotë të letrave (discardPile)
        if (data.discardPile && data.discardPile.length > 0) {
            discardPileElement.innerHTML = ''; // Pastrojmë për të vizatuar historinë e re
            
            data.discardPile.forEach((card, index) => {
                const isRed = ['♥', '♦'].includes(card.s);
                const cardDiv = document.createElement('div');
                cardDiv.className = 'card-on-table';
                cardDiv.style.color = isRed ? 'red' : 'black';
                
                // I rendisim pak mbi njëra-tjetrën (psh 15px diferencë)
                cardDiv.style.position = 'absolute';
                cardDiv.style.left = (index * 15) + 'px'; 
                
                cardDiv.innerHTML = `${card.v}<br>${card.s}`;
                discardPileElement.appendChild(cardDiv);
            });
        } else if (data.discardPileTop) {
            // Backup nëse vjen vetëm letra e fundit
            const isRed = ['♥', '♦'].includes(data.discardPileTop.s);
            discardPileElement.innerHTML = `
                <div class="card-on-table" style="color: ${isRed ? 'red' : 'black'}">
                    ${data.discardPileTop.v}<br>${data.discardPileTop.s}
                </div>`;
        } else {
            discardPileElement.innerHTML = '<span class="label">HEDH KËTU</span>';
        }
    }

    // 4. Përditëso Jackpot-in
    if (jackpotElement) {
        if (data.jackpotCard) {
            const isRedJackpot = ['♥', '♦'].includes(data.jackpotCard.s);
            jackpotElement.innerHTML = `${data.jackpotCard.v}<br>${data.jackpotCard.s}`;
            jackpotElement.style.color = isRedJackpot ? 'red' : 'white';
            jackpotElement.style.display = 'block';
        } else {
            jackpotElement.style.display = 'none';
        }
    }

    // 5. Kontrolli i Radhës (Glow & Status)
    isMyTurn = (data.activePlayerId === socket.id);
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    if (statusTeksti) statusTeksti.innerText = isMyTurn ? "Rradha jote!" : "Pret rradhën...";
    if (statusDrita) statusDrita.className = isMyTurn ? 'led-green' : 'led-red';

    // 7. Thirr funksionet ndihmëse
    if (typeof updateGameFlow === "function") updateGameFlow(data);
    if (typeof checkTurnLogic === "function") checkTurnLogic();
});

function updateScoreboard(players, activeId) {
    const scoreBody = document.getElementById('score-body');
    const scoreHeader = document.querySelector('#score-table thead tr');
    if (!scoreBody || !scoreHeader) return;

    // 1. Gjejmë numrin maksimal të raundeve (sigurohemi që history ekziston)
    let maxRounds = players.reduce((max, p) => {
        const historyLen = (p.history && Array.isArray(p.history)) ? p.history.length : 0;
        return Math.max(max, historyLen);
    }, 0);

    // 2. Krijojmë Header-in
    let headerHTML = `<th>Lojtari</th>`;
    for (let i = 1; i <= maxRounds; i++) {
        headerHTML += `<th>R${i}</th>`;
    }
    headerHTML += `<th>Total</th>`;
    scoreHeader.innerHTML = headerHTML;

    // 3. Mbushim rreshtat
    scoreBody.innerHTML = '';
    players.forEach(player => {
        const row = document.createElement('tr');
        
        // Klasat për stilim
        if (player.id === activeId) row.classList.add('active-row');
        if (player.score >= 71) row.classList.add('eliminated'); // Zion: 71 e lartë eliminohesh

        let nameCell = `<td>${player.name} ${player.id === socket.id ? '<small>(Ti)</small>' : ''}</td>`;
        
        let historyCells = '';
        for (let i = 0; i < maxRounds; i++) {
            // Shfaqim vlerën, nëse është "X" (fituesi) e bëjmë me ngjyrë tjetër në CSS
            let pikaRaundi = (player.history && player.history[i] !== undefined) ? player.history[i] : '-';
            historyCells += `<td>${pikaRaundi}</td>`;
        }

        let totalCell = `<td><strong>${player.score}</strong></td>`;
        
        row.innerHTML = nameCell + historyCells + totalCell;
        scoreBody.appendChild(row);
    });
}
function updateGameFlow(data) {
    isMyTurn = (data.activePlayerId === socket.id);
    
    // Vizualizimi i radhës (Pika 15)
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // Kontrolli i Deck-ut (Stiva) - Pika 12
    const deck = document.getElementById('deck');
    if (isMyTurn && doraImeData.length === 10) {
        deck.classList.add('active-deck'); // Bëhet me dritë që të tërheqësh letrën
    } else {
        deck.classList.remove('active-deck');
    }

    // Përditësojmë Jackpot-in (Pika 6)
    const jackpot = document.getElementById('jackpot');
    if (data.jackpotCard) {
        jackpot.innerHTML = `${data.jackpotCard.v}<br>${data.jackpotCard.s}`;
        jackpot.style.color = ['♥', '♦'].includes(data.jackpotCard.s) ? 'red' : 'white';
        jackpot.style.display = 'block';
    }
}

socket.on('cardDrawn', (newCard) => {
    animateCardDraw();
    doraImeData.push(newCard);
    renderHand();
    checkTurnLogic();
});
function checkZionCondition() {
    const btnMbyll = document.getElementById('btn-mbyll');
    if (!btnMbyll) return;

    if (doraImeData.length === 11 && isMyTurn) {
        btnMbyll.style.display = 'block';
        btnMbyll.innerHTML = "MBYLL LOJËN";
        btnMbyll.style.background = "#2ecc71";
    } else {
        btnMbyll.style.display = 'none';
    }
}

// ==========================================
// 3. RENDER HAND (Pika 18 - Renditja Interaktive)
// ==========================================
function renderHand() {
    const handContainer = document.getElementById('player-hand');
    if (!handContainer) return;
    handContainer.innerHTML = '';

    doraImeData.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;

        if (card.v === '★') {
            div.classList.add('joker');
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
        } else {
            div.innerHTML = `${card.v}<br>${card.s}`;
            if (['♥', '♦'].includes(card.s)) div.style.color = 'red';
        }
        
       div.addEventListener('mousedown', (e) => {
    const rect = div.getBoundingClientRect();
    div.dataset.offsetX = e.clientX - rect.left;
    div.dataset.offsetY = e.clientY - rect.top;
    div.classList.add('dragging');
    
    Object.assign(div.style, {
        position: 'fixed',
        zIndex: '1000',
        pointerEvents: 'none',
        width: rect.width + 'px',
        height: rect.height + 'px'
    });

    // Krijojmë lëvizjen dhe lëshimin specifike për mausin
   const onMouseMove = (e) => {
        if (!div.classList.contains('dragging')) return;
        
        div.style.left = (e.clientX - parseFloat(div.dataset.offsetX)) + 'px';
        div.style.top = (e.clientY - parseFloat(div.dataset.offsetY)) + 'px';

        // Logjika e renditjes (e njëjtë si te touchmove)
        const handContainer = document.getElementById('player-hand');
        const siblings = [...handContainer.querySelectorAll('.card:not(.dragging)')];
        const nextSibling = siblings.find(sibling => {
            const r = sibling.getBoundingClientRect();
            return e.clientX <= r.left + r.width / 2;
        });

        if (nextSibling) handContainer.insertBefore(div, nextSibling);
        else handContainer.appendChild(div);

        // 1. Feedback për discard-pile (Stiva normale)
        const pile = document.getElementById('discard-pile');
        const pRect = pile.getBoundingClientRect();
        const over = e.clientX > pRect.left && e.clientX < pRect.right &&
                     e.clientY > pRect.top && e.clientY < pRect.bottom;
        pile.classList.toggle('over', over);

        // 2. Feedback për victory-drop-zone (Mbyllja ZION mbi dekun)
        const victoryZone = document.getElementById('victory-drop-zone');
        if (victoryZone) {
            // E shfaqim vetëm nëse lojtari ka 11 letra dhe është radha e tij
            if (isMyTurn && doraImeData.length === 11) {
                victoryZone.style.display = 'flex';
                const vRect = victoryZone.getBoundingClientRect();
                const overVictory = e.clientX > vRect.left && e.clientX < vRect.right &&
                                    e.clientY > vRect.top && e.clientY < vRect.bottom;
                victoryZone.classList.toggle('over', overVictory);
            } else {
                victoryZone.style.display = 'none';
            }
        }
    };



    const onMouseUp = (e) => {
        div.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const pile = document.getElementById('discard-pile');
        const pRect = pile.getBoundingClientRect();
        const isOver = e.clientX > pRect.left - 20 && e.clientX < pRect.right + 20 &&
                       e.clientY > pRect.top - 20 && e.clientY < pRect.bottom + 20;

        // Kontrollojmë edhe Victory Zone
        const victoryZone = document.getElementById('victory-drop-zone');
        const isOverVictory = victoryZone && victoryZone.classList.contains('over');

        if (isOverVictory && isMyTurn && doraImeData.length === 11) {
            // RASTI 1: MBYLLJA ZION
            if (confirm("A dëshiron të MBYLLËSH lojën (ZION) me këtë letër?")) {
                socket.emit('declareZion', { 
                    discardedCard: { v: div.dataset.v, s: div.dataset.s },
                    hand: doraImeData.filter((_, i) => i !== parseInt(div.dataset.index))
                });
            } else {
                resetCardStyles(div);
                renderHand();
            }
        } else if (isOver && isMyTurn && doraImeData.length === 11) {
            // RASTI 2: HEDHJA NORMALE
            processDiscard(div);
        } else {
            // RASTI 3: RENDITJA E RE NË DORË
            const handContainer = document.getElementById('player-hand');
            const cardsInDOM = [...handContainer.querySelectorAll('.card')];
            doraImeData = cardsInDOM.map(cardEl => {
                return { v: cardEl.dataset.v, s: cardEl.dataset.s };
            });
            resetCardStyles(div);
            renderHand();
        }

        // Fshehim Rubikun pasi lëshojmë letrën
        if (victoryZone) {
            victoryZone.classList.remove('over');
            victoryZone.style.display = 'none';
        }
    };
           
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});
        // TOUCH START
        div.addEventListener('touchstart', (e) => {
            const t = e.touches[0]; 
            const rect = div.getBoundingClientRect();
            div.dataset.offsetX = t.clientX - rect.left;
            div.dataset.offsetY = t.clientY - rect.top;
            div.classList.add('dragging');
            
            Object.assign(div.style, {
                position: 'fixed',
                zIndex: '1000',
                pointerEvents: 'none',
                width: rect.width + 'px',
                height: rect.height + 'px'
            });
        }, { passive: true  });

        // MBANI VETËM KËTË - Ky bën çdo gjë: Lëvizjen, Renditjen dhe Feedback-un e Piles
div.addEventListener('touchmove', e => {
    if (!div.classList.contains('dragging')) return;
    const touch = e.touches[0];
    
    // 1. Pozicionimi i letrës nën gisht
    div.style.left = (touch.clientX - parseFloat(div.dataset.offsetX)) + 'px';
    div.style.top = (touch.clientY - parseFloat(div.dataset.offsetY)) + 'px';
    e.preventDefault();

    // 2. Logjika e renditjes
    const handContainer = document.getElementById('player-hand');
    const siblings = [...handContainer.querySelectorAll('.card:not(.dragging)')];
    const nextSibling = siblings.find(sibling => {
        const r = sibling.getBoundingClientRect();
        return touch.clientX <= r.left + r.width / 2;
    });

    if (nextSibling) {
        handContainer.insertBefore(div, nextSibling);
    } else {
        handContainer.appendChild(div);
    }

    // 3. Feedback vizual për discard-pile (Stiva normale)
    const pile = document.getElementById('discard-pile');
    const rectPile = pile.getBoundingClientRect();
    const isOverPile = touch.clientX > rectPile.left &&
                       touch.clientX < rectPile.right &&
                       touch.clientY > rectPile.top &&
                       touch.clientY < rectPile.bottom;
                       
    pile.classList.toggle('over', isOverPile);

    // 4. Feedback vizual për victory-drop-zone (Mbyllja ZION mbi dekun)
    const victoryZone = document.getElementById('victory-drop-zone');
    if (victoryZone) {
        if (isMyTurn && doraImeData.length === 11) {
            victoryZone.style.display = 'flex';
            const vRect = victoryZone.getBoundingClientRect();
            const isOverVictory = touch.clientX > vRect.left &&
                                 touch.clientX < vRect.right &&
                                 touch.clientY > vRect.top &&
                                 touch.clientY < vRect.bottom;
            
            victoryZone.classList.toggle('over', isOverVictory);
        } else {
            victoryZone.style.display = 'none';
        }
    }
    
}, { passive: false });;
        
// TOUCH END
div.addEventListener('touchend', e => {
    div.classList.remove('dragging');
    const touch = e.changedTouches[0];
    
    // 1. Kontrolli për Discard Pile (Stiva normale)
    const pile = document.getElementById('discard-pile');
    const rect = pile.getBoundingClientRect();
    const tolerance = 20;
    const isOverPile = touch.clientX > rect.left - tolerance &&
                       touch.clientX < rect.right + tolerance &&
                       touch.clientY > rect.top - tolerance &&
                       touch.clientY < rect.bottom + tolerance;

    // 2. Kontrolli për Victory Zone (Rubiku mbi deku)
    const victoryZone = document.getElementById('victory-drop-zone');
    let isOverVictory = false;
    if (victoryZone && victoryZone.style.display !== 'none') {
        const vRect = victoryZone.getBoundingClientRect();
        isOverVictory = touch.clientX > vRect.left - tolerance &&
                        touch.clientX < vRect.right + tolerance &&
                        touch.clientY > vRect.top - tolerance &&
                        touch.clientY < vRect.bottom + tolerance;
    }

    // Pastrojmë vizualisht klasat 'over'
    pile.classList.remove('over');
    if (victoryZone) victoryZone.classList.remove('over');

    // --- LOGJIKA E VENDIMMARRJES ---

    if (isOverVictory && isMyTurn && doraImeData.length === 11) {
        // RASTI A: MBYLLJA ZION
        if (confirm("A dëshiron të MBYLLËSH lojën (ZION) me këtë letër?")) {
            socket.emit('declareZion', { 
                discardedCard: { v: div.dataset.v, s: div.dataset.s },
                hand: doraImeData.filter((_, i) => i !== parseInt(div.dataset.index))
            });
        } else {
            resetCardStyles(div);
            renderHand();
        }
    } 
    else if (isOverPile && isMyTurn && doraImeData.length === 11) {
        // RASTI B: HEDHJA NORMALE
        processDiscard(div);
    } 
    else {
        // RASTI C: RENDITJA E RE (Pjesa që kërkove të shtohej)
        const handContainer = document.getElementById('player-hand');
        const currentCardsInDOM = [...handContainer.querySelectorAll('.card')];

        const newOrderedData = currentCardsInDOM.map(cardEl => {
            return { v: cardEl.dataset.v, s: cardEl.dataset.s };
        });

        doraImeData = newOrderedData;
        resetCardStyles(div);
        renderHand(); 
    }

    // Fshehim zonën e fitores në fund
    if (victoryZone) victoryZone.style.display = 'none';
});

        handContainer.appendChild(div);
    });

    // E zhvendosa këtë jashtë loop-it (forEach) që të mos thirret 11 herë
    if (typeof checkZionCondition === "function") checkZionCondition();
}

function resetCardStyles(el) {
    Object.assign(el.style, {
        position: '',
        left: '',
        top: '',
        width: '',
        height: '',
        zIndex: '',
        pointerEvents: 'auto',
        transform: ''
    });
}

// FUNKSIONI QË NDËRRON VENDET E LETRAVE

function handleReorder(clientX) {
    const draggingCard = document.querySelector('.card.dragging');
    if (!draggingCard) return;

    // Marrim të gjitha letrat e tjera që nuk po i lëvizim
    const cards = Array.from(handContainer.children).filter(c => c !== draggingCard);

    // Gjejmë letrën që kemi "përfundi" gishtit
    const sibling = cards.find(card => {
        const rect = card.getBoundingClientRect();
        // Kontrollojmë nëse gishti është në gjysmën e parë të letrës tjetër
        return clientX <= rect.left + rect.width / 2;
    });

    // Nëse gjetëm një fqinj, e vendosim letrën tonë para tij
    if (sibling) {
        handContainer.insertBefore(draggingCard, sibling);
    } else {
        // Nëse jemi në fund të rreshtit, e dërgojmë në fund
        handContainer.appendChild(draggingCard);
    }
}
// --- TOUCH END: LËSHIMI I LETRËS ---
// 1. NGJARJA KRYESORE KUR LËSHON LETRËN
document.addEventListener('touchend', (e) => {
    const draggingCard = document.querySelector('.card.dragging');
    if (!draggingCard) return;

    const touch = e.changedTouches[0];
    const discardRect = discardPile.getBoundingClientRect();
    const tolerance = 50;

    const isOverDiscard = (
        touch.clientX > discardRect.left - tolerance &&
        touch.clientX < discardRect.right + tolerance &&
        touch.clientY > discardRect.top - tolerance &&
        touch.clientY < discardRect.bottom + tolerance
    );

    // Kontrollojmë nëse është radha e lojtarit dhe ka 11 letra
    if (isOverDiscard && isMyTurn && doraImeData.length === 11) {
        processDiscard(draggingCard);
    } else {
        resetCardStyles(draggingCard);
        saveNewOrder();
    }

    // Pastrimi i stileve vizuale pas lëshimit
    draggingCard.classList.remove('dragging');
    discardPile.style.transform = "scale(1)";
    discardPile.style.borderColor = "#777"; 
}, { passive: false });

function saveNewOrder() {
    const currentCards = [...handContainer.querySelectorAll('.card')];
    
    // Marrim renditjen fiks siç e shohim në ekran
    doraImeData = currentCards.map(c => ({
        v: c.dataset.v,
        s: c.dataset.s
    }));

    console.log("Renditja e re u ruajt:", doraImeData);

    if (typeof updateAsistenti === "function") updateAsistenti();
}
// ==========================================
// 5. TËRHEQJA NGA STIVA (Pika 12 & 3)
// ==========================================


if (deckElement) {
    deckElement.addEventListener('click', () => {
        if (!isMyTurn) return;

        if (doraImeData.length === 10) {
            tookJackpotThisTurn = false;
            socket.emit('drawCard');
        } else {
            alert("Ti i ke 11 letra, duhet të hedhësh një në tokë!");
        }
    });
}

// Animacioni i letrës që lëviz nga Deck te Dora
function animateCardDraw() {
    const tempCard = document.createElement('div');
    tempCard.className = 'card temp-anim';
    tempCard.style.position = 'fixed';
    
    const deckRect = deckElement.getBoundingClientRect();
    tempCard.style.left = deckRect.left + 'px';
    tempCard.style.top = deckRect.top + 'px';
    tempCard.innerHTML = "ZION"; // Shpina e letrës
    
    document.body.appendChild(tempCard);

    // Lëvizja drejt dorës
    const handRect = handContainer.getBoundingClientRect();
    
    setTimeout(() => {
        tempCard.style.transform = `translate(${handRect.left - deckRect.left}px, ${handRect.top - deckRect.top}px) rotate(10deg)`;
        tempCard.style.opacity = '0';
    }, 50);

    // Fshijmë letrën e animacionit pas 0.5 sekondash
    setTimeout(() => tempCard.remove(), 500);
}

// ==========================================
// 6. HEDHJA E LETRËS (Discard)
// ==========================================

function processDiscard(cardElement) {
    // 0. Bllokojmë menjëherë radhën që mos të hedhë dot letër tjetër gjatë animacionit
    isMyTurn = false; 

    const v = cardElement.dataset.v;
    const s = cardElement.dataset.s;

    // 1. Rregulli i Xhokerit
    if (v === '★' || v === 'Jokeri' || v === 'joker' || v === 'Xhoker') {
        alert("Xhokeri nuk hidhet në tokë!");
        isMyTurn = true; // Ia kthejmë radhën që të provojë letër tjetër
        resetCardStyles(cardElement);
        renderHand();
        return;
    }

    // 2. Gjejmë indeksin
    const cardIndex = doraImeData.findIndex(c => c.v === v && c.s === s);
    
    if (cardIndex !== -1) {
        // Heqim letrën nga array lokal
        doraImeData.splice(cardIndex, 1);

        // 3. Animacioni
        const discardZone = document.getElementById('discard-pile');
        const rect = cardElement.getBoundingClientRect();
        const targetRect = discardZone.getBoundingClientRect();

        Object.assign(cardElement.style, {
            position: 'fixed',
            left: rect.left + 'px',
            top: rect.top + 'px',
            zIndex: '2000',
            pointerEvents: 'none',
            transition: "all 0.4s cubic-bezier(0.6, -0.28, 0.735, 0.045)"
        });

        requestAnimationFrame(() => {
            cardElement.style.left = (targetRect.left + (targetRect.width / 2) - (rect.width / 2)) + 'px';
            cardElement.style.top = (targetRect.top + (targetRect.height / 2) - (rect.height / 2)) + 'px';
            cardElement.style.transform = "scale(0.3) rotate(30deg)";
            cardElement.style.opacity = "0";
        });
        
        setTimeout(() => {
            cardElement.style.transition = "all 0.4s cubic-bezier(0.6, -0.28, 0.735, 0.045)";
            cardElement.style.left = targetRect.left + 'px';
            cardElement.style.top = targetRect.top + 'px';
            cardElement.style.transform = "scale(0.5) rotate(15deg)";
            cardElement.style.opacity = "0.2"; // E bëjmë më transparente kur "hyn" në stivë
        }, 10);

        // 4. Njoftojmë serverin
        setTimeout(() => {
            socket.emit('cardDiscarded', { v, s });
            renderHand(); //
            
            // Nëse ke një funksion që kontrollon UI-në e radhës
            if (typeof checkTurnLogic === "function") checkTurnLogic();
        }, 400);
    } else {
        // Nëse diçka dështon, ia kthejmë radhën
        isMyTurn = true;
    }
} //
// ==========================================
// 7. ASISTENTI ZION & TURN LOGIC (Pika 7, 15)
// ==========================================

function checkTurnLogic() {
    const btnMbyll = document.getElementById('btn-mbyll');
    const statusDrita = document.getElementById('status-drita');
    const statusTeksti = document.getElementById('status-teksti');

    // 1. Kontrolli nëse është radha jote dhe ke 11 letra
    if (isMyTurn && doraImeData.length === 11) {
        
        // Thërrasim funksionin që kontrollon rregullat (Flush ose Grupe)
        const eshteGati = verifyZionRules(doraImeData);
        
        if (eshteGati) {
            btnMbyll.style.display = 'block';
            statusDrita.className = 'led-green'; 
            // Nëse e ka marrë nga Jackpot, njoftojmë për x2
            statusTeksti.innerText = tookJackpotThisTurn ? "ZION (X2)! Mbyllu." : "ZION! Mund të mbyllesh.";
        } else {
            btnMbyll.style.display = 'none';
            statusDrita.className = 'led-red';
            statusTeksti.innerText = "Rendit letrat ose hidh një.";
        }
    } else {
        // Kur nuk është radha ose s'ke 11 letra
        btnMbyll.style.display = 'none';
        statusDrita.className = isMyTurn ? 'led-yellow' : 'led-red';
        statusTeksti.innerText = isMyTurn ? "Tërhiq një letër..." : "Prit radhën...";
    }
}
// ALGORITMI I VERIFIKIMIT (Thjeshtuar për momentin)
function verifyZionRules(cards) {
    // 1. Kontrolli fillestar
    if (!cards || cards.length !== 11) return false;

    // Provojmë të heqim secilën letër si letër mbyllëse
    for (let i = 0; i < cards.length; i++) {
        const testHand = cards.filter((_, idx) => idx !== i);
        const closingCard = cards[i];

        // Rregull: Xhokeri nuk hidhet për mbyllje
        if (closingCard.v === '★' || closingCard.v === 'Xhoker') continue;

        // A. KONTROLLI I FLUSH (10 letra njësoj)
        const suits = ['♠', '♣', '♥', '♦'];
        const jokersCount = testHand.filter(c => c.v === '★' || c.v === 'Xhoker').length;

        let isFlush = false;
        for (let s of suits) {
            const sameSuitNormal = testHand.filter(c => c.s === s && c.v !== '★' && c.v !== 'Xhoker').length;
            if (sameSuitNormal + jokersCount >= 10) {
                console.log("ZION FLUSH gati me:", closingCard.v + closingCard.s);
                isFlush = true;
                break; 
            }
        }
        
        if (isFlush) return true;

        // B. KONTROLLI I GRUPEVE/RRADHËVE
        if (typeof canSolve === "function") {
            if (canSolve(testHand)) {
                console.log("ZION NORMAL gati me:", closingCard.v + closingCard.s);
                return true;
            }
        }
    }
    
    // Nëse pas 11 provave asgjë s'u gjet
    return false;
}

/**
 * Gjen një rradhë valide duke llogaritur Asin (1 dhe 14) dhe Xhokerat.
 */
function findAndRemoveSequence(suitCards, len, availableJokers) {
    // Rendisim vlerat (Asi trajtohet si 1 fillimisht)
    let vals = suitCards.map(c => ({ val: getVal(c), card: c }));
    
    // Provon dy konfigurime për Asin: si 1 (A-2-3) dhe si 14 (Q-K-A)
    let configs = [vals.map(v => v.val)];
    if (vals.some(v => v.val === 1)) {
        configs.push(vals.map(v => v.val === 1 ? 14 : v.val));
    }

    for (let config of configs) {
        config.sort((a, b) => a - b);
        let uniqueVals = [...new Set(config)];

        for (let startVal of uniqueVals) {
            let usedCardsInSeq = [];
            let currentJokers = availableJokers;
            let currentVal = startVal;
            let count = 0;

            while (count < len) {
                let foundCard = suitCards.find(c => {
                    let v = getVal(c);
                    if (config.includes(14) && v === 1) v = 14;
                    return v === currentVal;
                });

                if (foundCard && !usedCardsInSeq.includes(foundCard)) {
                    usedCardsInSeq.push(foundCard);
                } else if (currentJokers > 0) {
                    currentJokers--;
                } else {
                    break; // Nuk mund ta vazhdojmë rradhën
                }
                
                currentVal++;
                count++;
                if (count === len) {
                    return { usedCards: usedCardsInSeq, jokersUsed: availableJokers - currentJokers };
                }
            }
        }
    }
    return null;
}

/**
 * Kthen vlerën numerike të letrës.
 */
function getVal(card) {
    const v = card.v;
    if (v === 'A') return 1; 
    if (v === 'J') return 11;
    if (v === 'Q') return 12;
    if (v === 'K') return 13;
    return parseInt(v);
}

document.getElementById('btn-mbyll').addEventListener('click', () => {
    if (confirm("A dëshiron të mbyllësh lojën?")) {
        // Dërgojmë informacionin nëse u mbyll me Jackpot
        socket.emit('playerClosed', { 
            cards: doraImeData, 
            isJackpotClosing: tookJackpotThisTurn 
        });
    }
});
// ==========================================
// 8. JACKPOT LOGIC (Pika 6)
// ==========================================

jackpotElement.addEventListener('click', () => {
    // Rregulli: Jackpot merret vetëm nëse ke 10 letra (radha jote, pa marrë letër te stiva)
    if (isMyTurn && doraImeData.length === 10) {
        
        // --- UPDATE: Markojmë që mbyllja e mundshme është me Jackpot (x2) ---
        tookJackpotThisTurn = true; 
        
        socket.emit('drawJackpot');
        
        // Animacion vizual (Pika 6)
        jackpotElement.style.transform = "translateY(-50px) scale(1.2)";
        jackpotElement.style.opacity = "0";
        
        setTimeout(() => {
            jackpotElement.style.display = "none";
        }, 300);
    } else {
        alert("Jackpot merret vetëm si letra e fundit për mbyllje!");
    }
});


function canSolve(hand) {
    const jokers = hand.filter(c => c.v === '★' || c.v === 'Xhoker').length;
    const normalCards = hand.filter(c => c.v !== '★' && c.v !== 'Xhoker');

    // I rendisim që t'i gjejmë rradhët më lehtë
    normalCards.sort((a, b) => getVal(a) - getVal(b));

    return checkRecursive(normalCards, jokers);
}

function checkRecursive(cards, jokers) {
    // Nëse nuk ka më letra normale, kemi fituar (xhokerat e mbetur janë "wild")
    if (cards.length === 0) return true;

    const first = cards[0];

    // --- 1. PROVO GRUPIN (Vlera e njëjtë, simbole të çfarëdoshme) ---
    // Një grup mund të ketë 3 ose 4 letra
    const sameValue = cards.filter(c => c.v === first.v);
    
    for (let size = 3; size <= 4; size++) {
        for (let jUsed = 0; jUsed <= jokers; jUsed++) {
            let normalNeeded = size - jUsed;
            if (normalNeeded > 0 && normalNeeded <= sameValue.length) {
                // Heqim letrat që përdorëm për këtë grup
                const used = sameValue.slice(0, normalNeeded);
                const remaining = cards.filter(c => !used.includes(c));
                
                // Kontrollojmë recursiv letrat që mbetën
                if (checkRecursive(remaining, jokers - jUsed)) return true;
            }
        }
    }

    // --- 2. PROVO RRADHËN (Vlera pasuese, duhet simbol i njëjtë) ---
    const sameSuit = cards.filter(c => c.s === first.s);
    if (sameSuit.length + jokers >= 3) {
        // Provojmë vargje me gjatësi të ndryshme (3 deri 10)
        for (let len = 3; len <= 10; len++) {
            const sequenceResult = findAndRemoveSequence(sameSuit, len, jokers);
            if (sequenceResult) {
                const remaining = cards.filter(c => !sequenceResult.usedCards.includes(c));
                if (checkRecursive(remaining, jokers - sequenceResult.jokersUsed)) return true;
            }
        }
    }

    return false;
}

// Kur një lojtar mbyll lojën (ZION!)
socket.on('roundOver', (data) => {
    // data përmban: winnerName, loserPoints, updatedPlayers
    
    // 1. Shfaq njoftimin e fitores (Pika 7)
    alert(`ZION! ${data.winnerName} e mbylli raundin!`);

    // 2. Përditëso scoreboard-in me pikët e reja (Pika 17)
    updateScoreboard(data.updatedPlayers, null);

    // 3. Pastro tavolinën për raundin tjetër (Pika 16)
    doraImeData = [];
    renderHand();
    discardPile.innerHTML = '';
    jackpotElement.style.display = 'none';

    // 4. Shfaq butonin "Vazhdo" ose "Raundi i Ri" (vetëm për Host-in)
    if (data.isGameOver) {
        alert(`Loja përfundoi! Fituesi final është: ${data.finalWinner}`);
    }
});

// Kur një lojtar eliminohet (Pika 9)
socket.on('playerEliminated', (playerName) => {
    console.log(`${playerName} u eliminua sepse kaloi 71 pikë! 💀`);
});

// --- FUNKSIONI NDIHMËS PËR RENDITJEN (SHTESË) ---
// Siguron që letrat të qëndrojnë në renditjen që i la lojtari
function getHandOrder() {
    const cards = [...handContainer.querySelectorAll('.card')];
    return cards.map(c => ({
        v: c.dataset.v,
        s: c.dataset.s
    }));
}

// Eventi i fundit: Nëse lojtari rifreskon faqen, ruajmë emrin
window.addEventListener('beforeunload', () => {
    localStorage.setItem('zion_player_name', myName);
});

socket.on('initGame', () => {
    console.log("Loja nisi! Po fsheh Lobby-n...");
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-table').classList.remove('hidden');
});

socket.on('yourCards', (cards) => {
    console.log("Mora letrat e mia nga serveri:", cards);
    if (cards && Array.isArray(cards)) {
        doraImeData = cards; 
        renderHand();        
        checkTurnLogic();    
    }
});
console.log("Lidhja HTML -> Script: OK ✅");
