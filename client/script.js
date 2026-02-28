const socket = io('https://zion-71.onrender.com', {
    transports: ['polling', 'websocket']
});
let myName = sessionStorage.getItem('zion_player_name');

// Nëse nuk ka emër, ose emri është "null" si string (gabim i shpeshtë)
if (!myName || myName === "null") {
    myName = prompt("Shkruaj emrin tuaj për këtë lojë:");
    
    if (!myName || myName.trim() === "") {
        myName = "Lojtar_" + Math.floor(Math.random() * 999);
    }
    sessionStorage.setItem('zion_player_name', myName);
}

// KJO ËSHTË E RËNDËSISHME:
// Dërgojmë emrin vetëm PASI lidhemi me sukses
socket.on('connect', () => {
    console.log("U lidha me ID:", socket.id);
    socket.emit('joinGame', myName);
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

const btnStart = document.getElementById('btn-start');
btnStart.addEventListener('click', () => {
    console.log("Po dërgoj startGame te serveri...");
    socket.emit('startGame');  // Dërgon eventin tek serveri që nis lojën
});

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


socket.on('updateGameState', (data) => {
    console.log("Mora gjendjen e lojës:", data);

    gameStarted = data.gameStarted;
    // 1. KONTROLLI I LOBBY-T DHE TAVOLINËS (FIXED BRACKETS)
    const lobby = document.getElementById('lobby-controls');
    const table = document.getElementById('game-table');
    
    if (data.gameStarted) {
        console.log("URRA! Serveri tha që loja nisi.");
        if (lobby) {
            lobby.style.display = 'none';
            console.log("Lobby u fsheh.");
        }
        if (table) {
            table.style.display = 'block';
            console.log("Tavolina u shfaq.");
        }
        document.body.classList.add('game-active');
    } else {
        // Kthejmë Lobby-n nëse loja nuk ka nisur ende
        if (lobby) lobby.style.display = 'flex';
        if (table) table.style.display = 'none';
    }

    // 2. SHFAQJA E LETRËS NË TOKË (Discard Pile)
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

    // 3. PËRDITËSIMI I JACKPOT-IT
    const jackpotElement = document.getElementById('jackpot');
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

    // 4. KONTROLLI I RADHËS (Glow Effect)
    isMyTurn = (data.activePlayerId === socket.id);
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // 5. PËRDITËSO TABELËN E PIKËVE
    if (typeof updateScoreboard === "function") {
        updateScoreboard(data.players, data.activePlayerId);
    }

    // 6. UPDATE I LETRAVE (Me mbrojtje për renditjen manuale)
    if (data.players && Array.isArray(data.players)) {
        const me = data.players.find(p => p.id === socket.id);

        if (me && me.cards) {
            console.log("Letrat nga serveri:", me.cards.length);
            
            // Përditësojmë dorën vetëm nëse ka ndryshim sasie ose nëse sapo ka nisur
            const kaNdryshimNumri = me.cards.length !== doraImeData.length;
            const doraEshteBosh = doraImeData.length === 0;

            if (doraEshteBosh || kaNdryshimNumri) {
                doraImeData = [...me.cards]; 
                if (typeof renderHand === "function") {
                    renderHand();
                    console.log("Dora u vizatua me sukses.");
                }
            }
        }
    }
    
    // 7. PËRDITËSO RRJEDHËN E LOJËS (Deck lights, Turn logic)
    // Këto funksione ekzistojnë poshtë në kodin tënd, po i thërrasim këtu:
    if (typeof updateGameFlow === "function") {
        updateGameFlow(data);
    }

    if (typeof checkTurnLogic === "function") {
        checkTurnLogic();
    }
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

const btnStart = document.getElementById('btn-start');

if (btnStart) {
    btnStart.onclick = () => {
        console.log("Duke kërkuar nisjen e lojës...");
        socket.emit('startGame');
    };
}


socket.on('cardDrawn', (newCard) => {
    animateCardDraw();
    doraImeData.push(newCard);
    renderHand();
    checkTurnLogic();
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
        const div = document.createElement('div'); 
        div.className = 'card';
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;
        
        // --- VETËM KJO PJESË NDRYSHON PËR JOKERIN ---
        if (card.v === '★') {
            div.classList.add('joker');
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
            div.style.color = 'gold'; // Ta bëjmë xhokerin të dallohet
        } else {
            // Letrat normale
            if (['♥', '♦'].includes(card.s)) div.style.color = 'red';
            div.innerHTML = `${card.v}<br>${card.s}`;
        }
        // -------------------------------------------

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
            
            const pile = document.getElementById('discard-pile');
            if (dropTarget && (dropTarget === pile || pile.contains(dropTarget))) {
                processDiscard(div); 
            } else {
                renderHand(); 
            }
        });

        handContainer.appendChild(div);
    });

    // E zhvendosa këtë jashtë loop-it (forEach) që të mos thirret 11 herë
    if (typeof checkZionCondition === "function") {
        checkZionCondition();
    }
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
    // 1. Kontrolli fillestar: Duhet t'i kemi saktësisht 11 letra për të mbyllur raundin
    if (!cards || cards.length !== 11) return false;

    // Provojmë të heqim secilën letër (si letër mbyllëse që do hidhet në tokë)
    // dhe shohim nëse 10 letrat që mbeten plotësojnë kushtet.
    for (let i = 0; i < cards.length; i++) {
        // Krijojmë një dorë testuese me 10 letra (hiqet letra i-të)
        const testHand = cards.filter((_, idx) => idx !== i);
        const closingCard = cards[i];

        // Rregull: Xhokeri nuk mund të jetë letra që hidhet për mbyllje!
        if (closingCard.v === '★' || closingCard.v === 'Xhoker') continue;

        // =========================================================
        // A. KONTROLLI I FLUSH (10 letra me simbol të njëjtë)
        // =========================================================
        const suits = ['♠', '♣', '♥', '♦'];
        const jokersCount = testHand.filter(c => c.v === '★' || c.v === 'Xhoker').length;

        let isFlush = false;
        for (let s of suits) {
            const sameSuitNormal = testHand.filter(c => c.s === s && c.v !== '★' && c.v !== 'Xhoker').length;
            if (sameSuitNormal + jokersCount >= 10) {
                console.log("ZION FLUSH i mundshëm me letrën mbyllëse:", closingCard.v + closingCard.s);
                isFlush = true;
                break; 
            }
        }
        
        // Nëse gjetëm FLUSH, kthejmë true menjëherë
        if (isFlush) return true;

        // =========================================================
        // B. KONTROLLI I GRUPEVE/RRADHËVE (canSolve)
        // =========================================================
        // Nëse nuk është Flush, kontrollojmë nëse 10 letrat janë të lidhura saktë
        if (typeof canSolve === "function") {
            if (canSolve(testHand)) {
                console.log("ZION NORMAL i mundshëm me letrën mbyllëse:", closingCard.v + closingCard.s);
                return true;
            }
        }
    }
    
    // Nëse asnjë kombinim (nga 11 provat) nuk nxori fitues
    return false;

    
    // =========================================================
    // Provojmë të heqim secilën letër (si letër mbyllëse) dhe shohim
    // nëse 10 letrat e mbetura formojnë grupe të vlefshme.
    for (let i = 0; i < cards.length; i++) {
        // Krijojmë një dorë testuese me 10 letra
        let testHand = cards.filter((_, idx) => idx !== i);
        
        // Nëse funksioni canSolve ekziston dhe thotë "PO", ndizet butoni
        if (typeof canSolve === "function" && canSolve(testHand)) {
            console.log("ZION NORMAL! Grupet/Vargjet janë gati.");
            return true;
        }
    }
    
    return false;
}

/**
 * Algoritmi që provon të gjejë Grupe ose Rradhë në mënyrë rekursive.
 */
function checkRecursive(cards, jokers) {
    // Nëse nuk ka më letra normale, kemi fituar (xhokerat e mbetur janë "wild")
    if (cards.length === 0) return true;

    const first = cards[0];

    // --- PROVO GRUPIN (Vlera e njëjtë, simbole të çfarëdoshme) ---
    // Një grup mund të ketë 3 ose 4 letra
    const sameValue = cards.filter(c => c.v === first.v);
    
    for (let size = 3; size <= 4; size++) {
        for (let jUsed = 0; jUsed <= jokers; jUsed++) {
            let normalNeeded = size - jUsed;
            if (normalNeeded > 0 && normalNeeded <= sameValue.length) {
                // Heqim letrat që përdorëm për këtë grup
                const used = sameValue.slice(0, normalNeeded);
                const remaining = cards.filter(c => !used.includes(c));
                
                // Vazhdojmë kontrollin për letrat që mbetën
                if (checkRecursive(remaining, jokers - jUsed)) return true;
            }
        }
    }

    // --- PROVO RRADHËN (Vlera pasuese, DUHET SIMBOL I NJËJTË) ---
    const sameSuit = cards.filter(c => c.s === first.s);
    if (sameSuit.length + jokers >= 3) {
        // Provojmë rradhë me gjatësi të ndryshme (3 deri në 10)
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

// EVENTI I MBYLLJES (Kur klikon butonin MBYLL)
document.getElementById('btn-mbyll').addEventListener('click', () => {
    if (confirm("A dëshiron të mbyllësh lojën?")) {
        socket.emit('playerClosed', doraImeData);
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
    if (cards.length === 0) return true; 

    const first = cards[0];

    // --- 1. PROVO GRUPIN (Vlera e njëjtë - psh. tre 7-sha) ---
    const sameValue = cards.filter(c => c.v === first.v);
    
    // Provojmë grupe me madhësi 3 ose 4
    for (let size = 3; size <= 4; size++) {
        for (let jUsed = 0; jUsed <= jokers; jUsed++) {
            let normalNeeded = size - jUsed;
            // Nëse kemi mjaftueshëm letra normale për këtë madhësi grupi
            if (normalNeeded > 0 && normalNeeded <= sameValue.length) {
                const used = sameValue.slice(0, normalNeeded);
                const remaining = cards.filter(c => !used.includes(c));
                if (checkRecursive(remaining, jokers - jUsed)) return true;
            }
        }
    }

    // --- 2. PROVO RRADHËN (Psh. 5-6-7 me të njëjtin simbol) ---
    const sameSuit = cards.filter(c => c.s === first.s);
    if (sameSuit.length + jokers >= 3) {
        // Provojmë vargje nga 3 deri në 10 letra
        for (let len = 3; len <= 10; len++) {
            const res = findAndRemoveSequence(sameSuit, len, jokers);
            if (res) {
                const remaining = cards.filter(c => !res.usedCards.includes(c));
                if (checkRecursive(remaining, jokers - res.jokersUsed)) return true;
            }
        }
    }

    return false;
}

// Funksion ndihmës për të gjetur vlerën numerike
function getVal(card) {
    const v = card.v;
    if (v === 'A') return 1; 
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
socket.on('yourCards', (cards) => {
    console.log("Mora letrat e mia nga serveri:", cards);
    if (cards && Array.isArray(cards)) {
        doraImeData = cards; 
        renderHand();        
        checkTurnLogic();    
    }
});
