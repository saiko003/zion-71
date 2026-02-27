const socket = io('https://zion-71.onrender.com', {
    transports: ['polling', 'websocket']
});
const handContainer = document.getElementById('player-hand');
const deckElement = document.getElementById('deck');
const jackpotElement = document.getElementById('jackpot');
const discardPile = document.getElementById('discard-pile');
const btnMbyll = document.getElementById('btn-mbyll');
const statusDrita = document.getElementById('status-drita');
const statusTeksti = document.getElementById('status-teksti');
const lobbyControls = document.getElementById('lobby-controls');
const gameTable = document.getElementById('game-table');


// Ruajtja e emrit dhe identifikimi
let myName = localStorage.getItem('zion_player_name') || prompt("Shkruaj emrin tënd:");
if (!myName) myName = "Lojtar_" + Math.floor(Math.random() * 1000);
localStorage.setItem('zion_player_name', myName);

let doraImeData = [];
let isMyTurn = false;

// Bashkohu në lojë
socket.emit('joinGame', myName);

if (btnMbyll) {
    btnMbyll.addEventListener('click', () => {
        // Kontrolli: A i ka lojtari 11 letra? (Nuk mund të mbyllësh me 10)
        if (doraImeData.length !== 11) {
            alert("Duhet të kesh 11 letra për të mbyllur lojën!");
            return;
        }

        if (confirm("A dëshiron ta mbyllësh lojën (ZION)?")) {
            socket.emit('playerClosed', { cards: doraImeData });
        }
    });
}

// ==========================================
// 2. SCOREBOARD DINAMIK (Pika 17)
// ==========================================
socket.on('updateGameState', (data) => {
    // 1. Kontrolli i Lobby-t (Përdorim getElementById direkt që të jemi 100% të sigurt)
    const lobby = document.getElementById('lobby-controls');
    const table = document.getElementById('game-table');
    
    if (data.gameStarted) {
        if (lobby) lobby.style.display = 'none';
        if (table) table.style.display = 'block'; 
    }
    
    // 2. SHFAQJA E LETRËS NË TOKË
    const discardPileElement = document.getElementById('discard-pile');
    if (discardPileElement) {
        if (data.discardPileTop) {
            const isRed = ['♥', '♦'].includes(data.discardPileTop.s);
            discardPileElement.innerHTML = `
                <div class="card-on-table" style="color: ${isRed ? 'red' : 'black'}">
                    ${data.discardPileTop.v}<br>${data.discardPileTop.s}
                </div>`;
        } else {
            discardPileElement.innerHTML = '<span class="label">HEDH KËTU</span>';
        }
    }

    // 3. Kontrolli i Radhës (Glow Effect)
    isMyTurn = (data.activePlayerId === socket.id);
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // 4. Përditëso Tabelën e Pikëve
    if (typeof updateScoreboard === "function") {
        updateScoreboard(data.players, data.activePlayerId);
    }

    // 5. Sinkronizimi i letrave
    const me = data.players.find(p => p.id === socket.id);
    if (me && me.cards && doraImeData.length === 0) {
        doraImeData = me.cards;
        if (typeof renderHand === "function") {
            renderHand();
        }
    }
});

function updateScoreboard(players, activeId) {
    const scoreBody = document.getElementById('score-body');
    const scoreHeader = document.querySelector('#score-table thead tr');
    if (!scoreBody || !scoreHeader) return;

    // Gjejmë sa është numri maksimal i raundeve që është luajtur
    let maxRounds = players.reduce((max, p) => Math.max(max, (p.history ? p.history.length : 0)), 0);

    // Krijojmë Header-in: Lojtari | R1 | R2 | ... | Total
    let headerHTML = `<th>Lojtari</th>`;
    for (let i = 1; i <= maxRounds; i++) {
        headerHTML += `<th>R${i}</th>`;
    }
    headerHTML += `<th>Total</th>`;
    scoreHeader.innerHTML = headerHTML;

    // Mbushim rreshtat për çdo lojtar
    scoreBody.innerHTML = '';
    players.forEach(player => {
        const row = document.createElement('tr');
        if (player.id === activeId) row.classList.add('active-row'); // Pika 15: Turn Indicator
        if (player.score > 71) row.classList.add('eliminated'); // Pika 9: Eliminimi

        let nameCell = `<td>${player.name} ${player.id === socket.id ? '<b>(Ti)</b>' : ''}</td>`;
        
        let historyCells = '';
        for (let i = 0; i < maxRounds; i++) {
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

document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('startGame');
    // Forco fshehjen menjëherë pas klikimit
    document.getElementById('lobby-controls').style.display = 'none';
    document.getElementById('game-table').style.display = 'block';
});

// 1. Dëgjojmë për letrat që dërgon serveri
socket.on('receiveCards', (cards) => {
    console.log("Letrat u pranuan:", cards);
    
    // Ruajmë letrat në variablën tonë globale
    doraImeData = cards;
    
    // Thërrasim funksionin që i vizaton ato në HTML
    renderHand();
    
    // Shfaqim tavolinën dhe fshehim lobby-n
    document.getElementById('lobby-controls').style.display = 'none';
    document.getElementById('game-table').style.display = 'block';
});

// 2. Sigurohu që ke edhe këtë për letrat që do tërheqësh gjatë lojës
socket.on('cardDrawn', (newCard) => {
    doraImeData.push(newCard);
    renderHand();
});

function checkZionCondition() {
    // Për momentin, po e bëjmë që butoni të shfaqet nëse lojtari ka 11 letra
    // (Më vonë do të shtojmë logjikën që kontrollon nëse janë rresht/grupe)
    if (doraImeData.length === 11) {
        btnMbyll.style.display = 'block';
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
        const div = document.createElement('div'); // KORRIGJUAR: ishte ddiv
        div.className = 'card';
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;
        
        if (['♥', '♦'].includes(card.s)) div.style.color = 'red';
        div.innerHTML = `${card.v}<br>${card.s}`;

        // TOUCH START
        div.addEventListener('touchstart', (e) => {
            const t = e.touches[0]; // Marrim touch-in e parë
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
        }, { passive: true });

        div.addEventListener('touchmove', (e) => {
            if (!div.classList.contains('dragging')) return;
            const touch = e.touches[0];
            div.style.left = (touch.clientX - parseFloat(div.dataset.offsetX)) + 'px';
            div.style.top = (touch.clientY - parseFloat(div.dataset.offsetY)) + 'px';
        }, { passive: true });

        div.addEventListener('touchend', (e) => {
            div.classList.remove('dragging');
            const touch = e.changedTouches[0];
            const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // Kontrollojmë nëse e lëshuam mbi zonën e hedhjes (Discard Pile)
            const pile = document.getElementById('discard-pile');
            if (dropTarget && (dropTarget === pile || pile.contains(dropTarget))) {
                processDiscard(div); // Funksioni që e hedh letrën
            } else {
                renderHand(); // Nëse nuk e qëlloi vendin, ktheje letrën në dorë
            }
        });

        handContainer.appendChild(div);
        checkZionCondition();
    });
}

// --- KONTROLLI GLOBAL I LËVIZJES (TouchMove) ---
document.addEventListener('touchmove', (e) => {
    // 1. Gjejmë letrën që po lëvizim (Kritike!)
    const draggingCard = document.querySelector('.card.dragging');
    if (!draggingCard) return; // Nëse nuk po lëvizim asgjë, ndalo këtu.

    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];

    // 2. Lëvizim letrën nëpër ekran
    const offsetX = parseFloat(draggingCard.dataset.offsetX) || 0;
    const offsetY = parseFloat(draggingCard.dataset.offsetY) || 0;
    draggingCard.style.left = (touch.clientX - offsetX) + 'px';
    draggingCard.style.top = (touch.clientY - offsetY) + 'px';

    // 3. TANI përdorim listën e letrave të tjera për t'i renditur (Reorder)
    const otherCards = Array.from(handContainer.children).filter(c => !c.classList.contains('dragging'));
    
    // Logjika e renditjes:
    otherCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        // Nëse letra që po lëvizim kalon mesin e një letre tjetër
        if (touch.clientX > rect.left && touch.clientX < rect.right) {
            // Këtu ndodh shkëmbimi i vendeve
            if (touch.clientX < rect.left + rect.width / 2) {
                handContainer.insertBefore(draggingCard, card);
            } else {
                handContainer.insertBefore(draggingCard, card.nextSibling);
            }
        }
    });

}, { passive: false });
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


// 2. FUNKSIONI QË KONTROLLON RREGULLAT E HEDHJES
function processDiscard(cardElement) {
    const v = cardElement.dataset.v;
    const s = cardElement.dataset.s;

    // Kontrolli për Xhokerin (★)
    if (v === '★' || s === 'Xhoker' || s === 'Joker') {
        alert("Xhokeri nuk mund të hidhet! Duhet ta mbash deri në fund.");
        resetCardStyles(cardElement);
        return; 
    }

    // Nëse kalon kontrollin, njoftojmë serverin
    socket.emit('discardCard', { v, s });
    
    // E fshijmë nga ekrani dhe përditësojmë memorien
    cardElement.remove();
    saveNewOrder();
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
        transform: '' // Shto këtë për të hequr çdo mbetje të transformimeve
    });
}
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

// script.js
deckElement.addEventListener('click', () => {
    if (!isMyTurn) return; // Nëse nuk është radha jote, nuk bën dot asgjë
    
    // Rregulli: Mund të marrësh letër vetëm nëse ke 10 letra në dorë
    if (doraImeData.length === 10) {
        socket.emit('drawCard');
    } else {
        alert("Ti i ke 11 letra, duhet të hedhësh një në tokë!");
    }
});

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

// Marrja e letrës së re nga serveri
socket.on('cardDrawn', (newCard) => {
    doraImeData.push(newCard); // Shtohet letra e 11-të
    renderHand();              // Rifreskohet pamja
    checkTurnLogic();          // Kontrollohet nëse mund të mbyllet (Pika 15)
});
// ==========================================
// 6. HEDHJA E LETRËS (Discard)
// ==========================================

function processDiscard(cardElement) {
    const v = cardElement.dataset.v;
    const s = cardElement.dataset.s;

    // 1. Rregulli i Xhokerit (Pika 5)
    if (v === '★' || v === 'Xhoker') {
        alert("Xhokeri nuk hidhet në tokë!");
        resetCardStyles(cardElement); // Ktheje letrën në pozicionin fillestar
        return;
    }

    // 2. Gjejmë indeksin e saktë në array duke krahasuar vlerën dhe simbolin
    const cardIndex = doraImeData.findIndex(c => c.v === v && c.s === s);
    
    if (cardIndex !== -1) {
        // Heqim letrën nga të dhënat tona
        doraImeData.splice(cardIndex, 1);

        // 3. Animacioni vizual drejt stivës së hedhjes
        const discardZone = document.getElementById('discard-pile');
        const rect = cardElement.getBoundingClientRect();
        const targetRect = discardZone.getBoundingClientRect();

        cardElement.style.position = 'fixed';
        cardElement.style.left = rect.left + 'px';
        cardElement.style.top = rect.top + 'px';
        cardElement.style.zIndex = '1000';
        
        // Fluturimi drejt stivës
        setTimeout(() => {
            cardElement.style.transition = "all 0.4s cubic-bezier(0.6, -0.28, 0.735, 0.045)";
            cardElement.style.left = targetRect.left + 'px';
            cardElement.style.top = targetRect.top + 'px';
            cardElement.style.transform = "scale(0.5) rotate(15deg)";
            cardElement.style.opacity = "0.5";
        }, 10);

        // 4. Njoftojmë serverin pas animacionit
        setTimeout(() => {
            socket.emit('cardDiscarded', { v, s });
            renderHand(); // Rifreskojmë dorën (tani me 10 letra)
            checkTurnLogic();
        }, 400);
    }
}
// ==========================================
// 7. ASISTENTI ZION & TURN LOGIC (Pika 7, 15)
// ==========================================

function checkTurnLogic() {
    const btnMbyll = document.getElementById('btn-mbyll');
    const statusDrita = document.getElementById('status-drita');
    const statusTeksti = document.getElementById('status-teksti');

    // 1. Kontrolli i butonit MBYLL (Shfaqet vetëm nëse ka 11 letra dhe është radha jote)
    if (isMyTurn && doraImeData.length === 11) {
        // Kontrollojmë nëse dora është valide (9 letra të lidhura + 1 xhoker + 1 për të hedhur)
        const eshteGati = verifyZionRules(doraImeData);
        
        if (eshteGati) {
            btnMbyll.style.display = 'block';
            statusDrita.className = 'led-green'; // Pika 7: Glow jeshil
            statusTeksti.innerText = "ZION! Mund të mbyllesh.";
        } else {
            btnMbyll.style.display = 'none';
            statusDrita.className = 'led-red';
            statusTeksti.innerText = "Rendit letrat ose hidh një.";
        }
    } else {
        btnMbyll.style.display = 'none';
        statusDrita.className = isMyTurn ? 'led-yellow' : 'led-red';
        statusTeksti.innerText = isMyTurn ? "Tërhiq një letër..." : "Prit radhën...";
    }
}

// ALGORITMI I VERIFIKIMIT (Thjeshtuar për momentin)
function verifyZionRules(cards) {
    // Rregulli: Duhet të kemi 11 letra për të kontrolluar mbylljen
    // Ne provojmë të heqim secilën letër (si letër mbyllëse) 
    // dhe shohim nëse 10 letrat e mbetura formojnë grupe/rreshta
    
    for (let i = 0; i < cards.length; i++) {
        let testHand = cards.filter((_, idx) => idx !== i);
        if (canSolve(testHand)) return true;
    }
    return false;
}

// Funksioni që kontrollon nëse 10 letra janë të lidhura (Pika 5)
function canSolve(hand) {
    // Këtu do të vendoset algoritmi i plotë që kontrollon:
    // 1. Grupet (3-4 letra me vlerë të njëjtë)
    // 2. Rreshtat (3+ letra në radhë, i njëjti simbol)
    // 3. Përdorimin e Xhokerit (★)
    
    // Për momentin, po e lëmë që të kthejë true nëse lojtari ka bërë renditjen
    // (Do ta pasurojmë këtë pjesë në hapin tjetër me logjikën matematike)
    return false; 
}

// EVENTI I MBYLLJES (Kur klikon butonin MBYLL)
document.getElementById('btn-mbyll').addEventListener('click', () => {
    if (confirm("A dëshiron të mbyllësh lojën?")) {
        socket.emit('playerClose', doraImeData);
    }
});
// ==========================================
// 8. JACKPOT LOGIC (Pika 6)
// ==========================================

jackpotElement.addEventListener('click', () => {
    // Rregulli: Jackpot merret vetëm nëse ke 10 letra (radha jote, pa marrë letër te stiva)
    if (isMyTurn && doraImeData.length === 10) {
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
// ==========================================
// 9. ALGORITMI I ZGJIDHJES (canSolve)
// ==========================================

function canSolve(hand) {
    if (hand.length !== 10) return false;

    // 1. Ndajmë Xhokerat nga letrat normale
    const jokers = hand.filter(c => c.v === '★' || c.v === 'Xhoker').length;
    const normalCards = hand.filter(c => c.v !== '★' && c.v !== 'Xhoker');

    // 2. Funksioni Rekursiv që provon të gjitha kombinimet
    return backtrack(normalCards, jokers);
}

function backtrack(cards, jokers) {
    // Nëse nuk kanë mbetur letra normale, kemi fituar (Xhokerat e mbetur plotësojnë çdo gjë)
    if (cards.length === 0) return true;

    // Marrim letrën e parë dhe provojmë të formojmë një GRUP ose RRESHT
    const first = cards[0];

    // --- PROVO GRUPIN (3 ose 4 letra me vlerë të njëjtë) ---
    const sameValue = cards.filter(c => c.v === first.v);
    for (let size = 2; size <= 4; size++) {
        const neededFromNormal = Math.min(size, sameValue.length);
        const neededJokers = size - neededFromNormal;

        if (size >= 3 && jokers >= neededJokers) {
            // Krijojmë një kopje të letrave pa ato që përdorëm në grup
            const remaining = cards.filter(c => !sameValue.slice(0, neededFromNormal).includes(c));
            if (backtrack(remaining, jokers - neededJokers)) return true;
        }
    }

    // --- PROVO RRESHTIN (3+ letra në radhë, i njëjti simbol) ---
    // (Për rreshtin duhet t'i kthejmë vlerat në numra: A=1/14, J=11, Q=12, K=13)
    const sameSuit = cards.filter(c => c.s === first.s).sort((a, b) => cardValue(a) - cardValue(b));
    // Provojmë të nisim një rresht nga 'first'
    for (let len = 3; len <= 10; len++) {
        if (canFormSequence(first, sameSuit, len, jokers)) {
            // Hiq letrat e përdorura dhe vazhdo kontrollin
            // (Kjo pjesë kërkon logjikë më të detajuar për heqjen e saktë)
        }
    }

    return false;
}

// Kthejmë vlerat tekst në numra për renditje
function cardValue(card) {
    const v = card.v;
    if (v === 'A') return 1; // Mund të jetë edhe 14, kërkon kontroll të dyfishtë
    if (v === 'J') return 11;
    if (v === 'Q') return 12;
    if (v === 'K') return 13;
    return parseInt(v);
}
// ==========================================
// 10. MBYLLJA E RAUNDIT & REZULTATET
// ==========================================

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
