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
let placeholder = null;
socket.on('lobbyMessage', (msg) => {
    const lobbyText = document.getElementById('lobby-text');
    if (lobbyText) lobbyText.innerText = msg;
});

// 1. LIDHJA E BUTONIT START
const btnstart = document.getElementById('btn-start');

if (btnstart) {
    btnstart.onclick = null; // Siguria e parë
    btnstart.addEventListener('click', () => {
        console.log("🚀 Po dërgoj startGame te serveri...");
        socket.emit('startGame');
    });
}

// 2. LIDHJA E VETME DHE E PASTER PER DEKUN (ZION)
const realDeck = document.getElementById('deck-zion') || document.getElementById('deck-pile');

if (realDeck) {
    // Fshijmë onclick-un e vjetër që kishe te 'deckElement'
    realDeck.onclick = null; 

    realDeck.addEventListener('click', () => {
        console.log("Klikuar mbi dekun...");

        // Logjika e saktë: Radha jote dhe 10 letra
        if (isMyTurn && doraImeData.length === 10) {
            tookJackpotThisTurn = false; 
            socket.emit('drawCard');
            console.log("✅ Kërkesa u dërgua: drawCard");
        } 
        else if (isMyTurn && doraImeData.length === 11) {
            alert("Ti e ke marrë letrën! Tani duhet të hedhësh një në tokë.");
        }
        else if (!isMyTurn) {
            console.warn("Prit radhën tënde!");
        }
    });
}

// 1. LIDHJA E KLIKIMIT TË DEKUT (ZION) - Versioni i Pastër
const deckZion = document.getElementById('deck-zion'); 

if (deckZion) {
    // Fshijmë çdo 'onclick' të vjetër që mund të jetë deklaruar diku tjetër
    deckZion.onclick = null; 

    // Përdorim addEventListener që është më i sigurt
    deckZion.addEventListener('click', () => {
        // Kontrollojmë: A është radha ime dhe a kam saktësisht 10 letra?
        if (isMyTurn && doraImeData.length === 10) {
            
            // Opsionale: Mund ta markojmë që sapo tërhoqi letër që të mos klikohet dot 2 herë brenda sekondës
            // tookJackpotThisTurn = false; 

            socket.emit('drawCard');
            console.log("✅ U dërgua kërkesa për të marrë letër nga deku.");
        } 
        else if (isMyTurn && doraImeData.length === 11) {
            alert("Ti e ke marrë letrën! Tani duhet të hedhësh një në tokë.");
        }
        else if (!isMyTurn) {
            console.log("Nuk është radha jote, prit pak.");
        }
    });
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
    // 5. Kontrolli i Radhës (Glow & Status)
    isMyTurn = (data.activePlayerId === socket.id);
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    if (statusTeksti) statusTeksti.innerText = isMyTurn ? "Rradha jote!" : "Pret rradhën...";
    if (statusDrita) statusDrita.className = isMyTurn ? 'led-green' : 'led-red';

    // --- SHTO KËTË PJESË KËTU ---
    const deckElement = document.getElementById('deck-zion') || document.getElementById('deck-pile');
    if (deckElement) {
        // Logjika: Ndihet vetëm nëse është radha ime DHE kam 10 letra
        // (Që do të thotë sapo kam hedhur njërën dhe serveri pret të tërheq)
        if (isMyTurn && doraImeData.length === 10) {
            deckElement.classList.add('deck-glow');
        } else {
            deckElement.classList.remove('deck-glow');
        }
    }
    
// 6. Update i Letrave (Versioni i përmirësuar)
if (data.players) {
    const me = data.players.find(p => p.id === socket.id);
    if (me && me.cards) {
        
        // 1. Sigurohemi që ID-të janë konsistente
        const serverCardsWithIds = me.cards.map(card => ({
            ...card,
            id: card.id || `${card.v}-${card.s}`
        }));

        const isDragging = document.querySelector('.card.dragging');

        // 2. Sinkronizimi i mençur
        if (!isDragging) {
            
            // RASTI A: Kemi marrë letër të re (Animacioni i tërheqjes)
            if (doraImeData.length > 0 && serverCardsWithIds.length > doraImeData.length) {
                serverCardsWithIds.forEach(sCard => {
                    const exists = doraImeData.some(myCard => myCard.id === sCard.id);
                    if (!exists) {
                        pickCardFromDeck(sCard); 
                    }
                });
            } 
            // RASTI B: Kemi hedhur letër (Serveri konfirmon që kemi 10 letra)
            else if (serverCardsWithIds.length < doraImeData.length) {
                doraImeData = doraImeData.filter(myCard => 
                    serverCardsWithIds.some(sCard => sCard.id === myCard.id)
                );
                renderHand();
            }
            // RASTI C: Fillimi i lojës ose reset
            else if (doraImeData.length === 0) {
                doraImeData = [...serverCardsWithIds];
                renderHand();
            }
            
            // --- SIGURESA SHTESË ---
            // Nëse për ndonjë arsye numri i letrave nuk përputhet (psh. humbje pakete)
            // bëjmë një sinkronizim të detyruar që loja mos të bllokohet
            if (doraImeData.length !== serverCardsWithIds.length) {
                doraImeData = [...serverCardsWithIds];
                renderHand();
            }
        }
    }
}

// 7. Kontrolli i dritës së Dekut (E SHTUAR)
const deckElement = document.getElementById('deck-zion') || document.getElementById('deck-pile');

// Kontrollojmë nëse deckElement ekziston DHE nëse doraImeData nuk është null
if (deckElement && doraImeData) {
    if (isMyTurn && doraImeData.length === 10) {
        deckElement.classList.add('deck-glow');
    } else {
        deckElement.classList.remove('deck-glow');
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
                cardDiv.style.left = (Math.min(index, 10) * 15) + 'px'; // Max 10 letra duken, të tjerat palosen nën to
                
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
    if (typeof checkZionCondition === "function") checkZionCondition();
});

function updateScoreboard(players, activeId) {
    // NDRYSHIMI I VETËM: Përdorim ID-në e re 'side-score-body' dhe 'side-score-table'
    // që të mos përplaset me tabelën e modalit të rezultateve
    const scoreBody = document.getElementById('side-score-body'); 
    const scoreTable = document.getElementById('side-score-table');
    if (!scoreBody || !scoreTable) return;
    
    const scoreHeader = scoreTable.querySelector('thead tr');
    if (!scoreHeader) return;

    // 1. Gjejmë numrin maksimal të raundeve (Logjika jote e paprekur)
    let maxRounds = players.reduce((max, p) => {
        const historyLen = (p.history && Array.isArray(p.history)) ? p.history.length : 0;
        return Math.max(max, historyLen);
    }, 0);

    // 2. Krijojmë Header-in (Logjika jote e paprekur)
    let headerHTML = `<th>Lojtari</th>`;
    for (let i = 1; i <= maxRounds; i++) {
        headerHTML += `<th>R${i}</th>`;
    }
    headerHTML += `<th>Total</th>`;
    scoreHeader.innerHTML = headerHTML;

    // 3. Mbushim rreshtat (Logjika jote e paprekur)
    scoreBody.innerHTML = '';
    players.forEach(player => {
        const row = document.createElement('tr');
        
        // Klasat për stilim
        if (player.id === activeId) row.classList.add('active-row');
        if (player.score >= 71) row.classList.add('eliminated'); 

        let nameCell = `<td>${player.name} ${player.id === socket.id ? '<small>(Ti)</small>' : ''}</td>`;
        
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
    
    // Vizualizimi i radhës
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // Kontrolli i Deck-ut (Stiva)
    const deck = document.getElementById('deck');
    if (deck) { // SHTO KËTË KONTROLL
        if (isMyTurn && doraImeData.length === 10) {
            deck.classList.add('active-deck');
        } else {
            deck.classList.remove('active-deck');
        }
    }

    // Përditësojmë Jackpot-in
    const jackpot = document.getElementById('jackpot');
    if (jackpot && data.jackpotCard) { // SHTO KONTROLLIN 'jackpot &&'
        jackpot.innerHTML = `${data.jackpotCard.v}<br>${data.jackpotCard.s}`;
        jackpot.style.color = ['♥', '♦'].includes(data.jackpotCard.s) ? 'red' : 'white';
        jackpot.style.display = 'block';
    }
}

socket.on('cardDrawn', (newCard) => {
    // 1. Përdorim funksionin e ri të animacionit (fshihet animateCardDraw)
    // Ky funksion do të merret edhe me shtimin e letrës në 'doraImeData'
    pickCardFromDeck(newCard); 

    // 2. Kontrollojmë Zion-in (nëse nuk thirret brenda renderHand)
    if (typeof checkZionCondition === "function") {
        checkZionCondition();
    }
});

function checkZionCondition() {
    const btnMbyll = document.getElementById('btn-mbyll');
    const statusDrita = document.getElementById('status-drita');
    const statusTeksti = document.getElementById('status-teksti');

    if (!btnMbyll) return;

    // 1. Kushti kryesor: Duhet të jetë radha jote dhe të kesh 11 letra
    if (isMyTurn && doraImeData.length === 11) {
        
        // 2. Thërrasim algoritmin e mençur që kontrollon grupet (isDoraValid)
        // Shënim: Sigurohu që emri i funksionit këtu të jetë ai që dërgova më parë
        const eshteGati = isDoraValid(doraImeData);
        
        if (eshteGati) {
            btnMbyll.style.display = 'block';
            btnMbyll.style.background = "#2ecc71"; // Jeshile e bukur
            btnMbyll.innerHTML = "MBYLL LOJËN (ZION)";
            
            if (statusDrita) statusDrita.className = 'led-green';
            if (statusTeksti) {
                statusTeksti.innerText = (typeof tookJackpotThisTurn !== 'undefined' && tookJackpotThisTurn) 
                    ? "ZION (X2)! Mbyllu." 
                    : "ZION! Mund të mbyllesh.";
            }
        } else {
            // Radha jote, ke 11 letra, por NUK i ke të rregulluara
            btnMbyll.style.display = 'none';
            if (statusDrita) statusDrita.className = 'led-orange'; // Portokalli: "Amigo, rregulloi letrat"
            if (statusTeksti) statusTeksti.innerText = "Rendit letrat në grupe...";
        }
    } else {
        // Kur nuk është radha ose s'ke 11 letra (ende s'ke tërhequr)
        btnMbyll.style.display = 'none';
        if (statusDrita) {
            statusDrita.className = isMyTurn ? 'led-yellow' : 'led-red';
        }
        if (statusTeksti) {
            statusTeksti.innerText = isMyTurn ? "Tërhiq një letër..." : "Prit radhën...";
        }
    }
}

// ==========================================
// 3. RENDER HAND (Pika 18 - Renditja Interaktive)
// ==========================================
// 1. Variablat globale për të menaxhuar dragging-un
let dragElement = null;

function renderHand() {
    const handContainer = document.getElementById('player-hand');
    if (!handContainer) return;
    
    // 1. ZGJIDHJA PËR LETRËN E DYTË:
    // Pastrojmë çdo letër dragging që mund të ketë mbetur te body gabimisht
    const ghostCards = document.querySelectorAll('body > .card.dragging');
    ghostCards.forEach(card => card.remove());

    handContainer.innerHTML = '';

    doraImeData.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        
        // Datasetet
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;
        div.dataset.id = card.id || div.dataset.id || `card-${card.v}-${card.s}-${Math.random().toString(36).substr(2, 5)}`;

        if (card.v === '★') {
            div.classList.add('joker');
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
        } else {
            div.innerHTML = `${card.v}<br>${card.s}`;
            if (['♥', '♦'].includes(card.s)) div.style.color = 'red';
        }
        
        // 2. SIGURIA: Resetojmë çdo stil që mund të ketë mbetur nga dragging
        div.style.position = '';
        div.style.left = '';
        div.style.top = '';
        div.style.zIndex = '';
         
        div.onmousedown = onDragStart;
        div.ontouchstart = (e) => onDragStart(e);

        handContainer.appendChild(div);
    });

    if (typeof checkZionCondition === "function") checkZionCondition();
}

function onDragStart(e) {
    if (dragElement) return;

    const isTouch = e.type === 'touchstart';
    const t = isTouch ? e.touches[0] : e;
    const div = e.currentTarget;
    const rect = div.getBoundingClientRect();

    div.dataset.offsetX = t.clientX - rect.left;
    div.dataset.offsetY = t.clientY - rect.top;

    dragElement = div;

    // KRIJIMI I PLACEHOLDER-IT
    placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder'; // Shto këtë klasë në CSS (bosh/gri)
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.visibility = 'hidden'; // E padukshme por zë vend

    // E vendosim placeholder-in ekzaktesisht ku ishte letra
    div.parentNode.insertBefore(placeholder, div);

    // E nxjerrim letrën te BODY
    document.body.appendChild(div);

    Object.assign(div.style, {
        position: 'fixed',
        zIndex: '10000',
        pointerEvents: 'none',
        width: rect.width + 'px',
        height: rect.height + 'px',
        left: rect.left + 'px',
        top: rect.top + 'px',
        margin: '0',
        transform: 'none',
        transition: 'none'
    });

    div.classList.add('dragging');

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
}
function onDragMove(e) {
    if (!dragElement || !placeholder) return;
    if (e.cancelable) e.preventDefault();

    const t = e.type.includes('touch') ? e.touches[0] : e;
    
    // 1. Llogarisim pozicionin e ri
    let x = t.clientX - parseFloat(dragElement.dataset.offsetX);
    let y = t.clientY - parseFloat(dragElement.dataset.offsetY);

    // --- FILLIMI I UPDATE-IT PËR XHOKERIN ---
    const isJoker = dragElement.dataset.v === '★' || dragElement.classList.contains('joker');
    
    if (isJoker) {
        const handContainer = document.getElementById('player-hand');
        const handRect = handContainer.getBoundingClientRect();
        
        // Limiton 'y' që Xhokeri të mos dalë lart drejt stivës (Rregulli 18)
        const limitTop = handRect.top - 70; 
        if (y < limitTop) y = limitTop;
    }
    // --- FUNDI I UPDATE-IT ---

    // Lëvizja e letrës reale
    dragElement.style.left = x + 'px';
    dragElement.style.top = y + 'px';

    // Lëvizja e Placeholder-it brenda dorës (Logjika jote origjinale)
    const handContainer = document.getElementById('player-hand');
    const siblings = [...handContainer.querySelectorAll('.card:not(.dragging)')];
    
    const nextSibling = siblings.find(sibling => {
        const r = sibling.getBoundingClientRect();
        return t.clientX <= r.left + r.width / 2;
    });

    if (nextSibling) handContainer.insertBefore(placeholder, nextSibling);
    else handContainer.appendChild(placeholder);

    updateZonesFeedback(t.clientX, t.clientY);
}
function updateZonesFeedback(x, y) {
    const pile = document.getElementById('discard-pile');
    const victoryZone = document.getElementById('victory-drop-zone');

    if (pile) {
        const r = pile.getBoundingClientRect();
        const over = x > r.left && x < r.right && y > r.top && y < r.bottom;
        pile.classList.toggle('over', over);
    }

    if (victoryZone) {
        if (typeof isMyTurn !== 'undefined' && isMyTurn && doraImeData.length === 11) {
            victoryZone.style.display = 'flex';
            const r = victoryZone.getBoundingClientRect();
            const overV = x > r.left && x < r.right && y > r.top && y < r.bottom;
            victoryZone.classList.toggle('over', overV);
        } else {
            victoryZone.style.display = 'none';
        }
    }
}

function onDragEnd(e) {
    if (!dragElement) return;

    // 1. KORRIGJIMI PËR TOUCH (Që stiva ta shohë letrën saktë në Mobile)
    const t = e.type.includes('touch') ? 
              (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : e.touches[0]) : 
              e;

    const pile = document.getElementById('discard-pile');
    const victoryZone = document.getElementById('victory-drop-zone');
    const handContainer = document.getElementById('player-hand');
    const tolerance = 60; // E rrita pak për siguri që ta kapë më lehtë stivën

    let isOverPile = false;
    let isOverVictory = false;

    // Detektimi i zonave (Logjika jote origjinale)
    if (pile && t) {
        const r = pile.getBoundingClientRect();
        isOverPile = t.clientX > r.left - tolerance && t.clientX < r.right + tolerance && 
                     t.clientY > r.top - tolerance && t.clientY < r.bottom + tolerance;
    }

    if (victoryZone && victoryZone.style.display !== 'none' && t) {
        const r = victoryZone.getBoundingClientRect();
        isOverVictory = t.clientX > r.left - tolerance && t.clientX < r.right + tolerance && 
                        t.clientY > r.top - tolerance && t.clientY < r.bottom + tolerance;
    }

    // Heqja e eventeve
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchend', onDragEnd);

   // 2. KUSHTI PËR ZION
if (isOverVictory && isMyTurn && doraImeData.length === 11) {
    if (confirm("A dëshiron të mbyllësh lojën (ZION)?")) {
        isMyTurn = false; // Bllokoje menjëherë që të mos klikohet asgjë tjetër
        if (typeof placeholder !== 'undefined' && placeholder) placeholder.remove();
        
        socket.emit('declareZion', { 
            discardedCard: { 
                v: dragElement.dataset.v, 
                s: dragElement.dataset.s, 
                id: dragElement.dataset.id  // SHTO KËTË
            }, 
            hand: doraImeData.filter(c => c.id !== dragElement.dataset.id)
        });
        finalizeCleanup();
        dragElement = null;
        placeholder = null;
        return;
    }
}

    // 3. KUSHTI PËR HEDHJE
if (isOverPile && isMyTurn && doraImeData.length === 11) {
    isMyTurn = false; // JETIKE: E bëjmë false këtu që të mos bllokohet loja
    if (typeof placeholder !== 'undefined' && placeholder) placeholder.remove();
    
    // Thërrasim funksionin për dërgim
    processDiscard(dragElement);
} else {
        // 4. KTHIMI DHE RUAJTJA (Me update për Placeholder)
        if (typeof placeholder !== 'undefined' && placeholder && placeholder.parentNode) {
            // E kthejmë te vendi që i ruajti placeholder-i
            placeholder.parentNode.insertBefore(dragElement, placeholder);
        } else if (dragElement.parentNode !== handContainer) {
            handContainer.appendChild(dragElement);
        }

        if (typeof placeholder !== 'undefined' && placeholder) placeholder.remove();

        // Pastrimi i stileve inline
        Object.assign(dragElement.style, {
            position: '', zIndex: '', pointerEvents: '', 
            width: '', height: '', left: '', top: '',
            margin: '', transform: '', transition: ''
        });
        dragElement.classList.remove('dragging');

        // Ruajtja e renditjes (Logjika jote origjinale)
        const currentCards = [...handContainer.querySelectorAll('.card')];
        doraImeData = currentCards.map(c => ({
            v: c.dataset.v,
            s: c.dataset.s,
            id: c.dataset.id
        }));

        console.log("Renditja u ruajt:", doraImeData.length);
        renderHand(); 
    }
    
    dragElement = null; 
    placeholder = null;
    finalizeCleanup();
}
function finalizeCleanup() {
    if (dragElement) dragElement.classList.remove('dragging');
    dragElement = null;
    
    const pile = document.getElementById('discard-pile');
    const victoryZone = document.getElementById('victory-drop-zone');
    
    if (pile) pile.classList.remove('over');
    if (victoryZone) {
        victoryZone.classList.remove('over');
        victoryZone.style.display = 'none';
    }
}
function isDoraValid(cards) {
    // 0. Nëse nuk ka letra, ose ka vetëm 1, është automatikisht valid për mbyllje
    if (cards.length <= 1) return true;

    // 1. Ndajmë Xhokerat nga letrat normale
    const jokers = cards.filter(c => c.v === '★' || c.v === 'Jokeri' || c.v === 'joker' || c.v === 'Xhoker').length;
    const normalCards = cards.filter(c => c.v !== '★' && c.v !== 'Jokeri' && c.v !== 'joker' && c.v !== 'Xhoker');

    // 3. Funksioni Ndihmës për vlerat numerike (E lëvizëm lart që të njihet nga hapi 2)
    function getVal(card) {
        const mapping = { 'A': 1, 'J': 11, 'Q': 12, 'K': 13 };
        return mapping[card.v] || parseInt(card.v);
    }

    // 2. Ndajmë letrat sipas suitave (për kontrollin e vargjeve: 5-6-7)
    const suits = { '♠': [], '♣': [], '♥': [], '♦': [] };
    normalCards.forEach(c => {
        if (suits[c.s]) suits[c.s].push(getVal(c));
    });

    // 4. ALGORITMI I GRUPIMIT (SET-et: 8-8-8)
    const valueCounts = {};
    normalCards.forEach(c => {
        valueCounts[c.v] = (valueCounts[c.v] || 0) + 1;
    });

    let jUsedInSets = 0;
    let cardsInSets = 0;
    let tempJokers = jokers;

    // Kontrollojmë SET-et (3 ose 4 letra të njëjta)
    for (let v in valueCounts) {
        let count = valueCounts[v];
        if (count >= 3) {
            cardsInSets += count;
        } else if (count === 2 && tempJokers >= 1) {
            cardsInSets += 2;
            tempJokers -= 1;
            jUsedInSets += 1;
        } else if (count === 1 && tempJokers >= 2) {
            cardsInSets += 1;
            tempJokers -= 2;
            jUsedInSets += 2;
        }
    }

    // 5. ALGORITMI I VARGJEVE (I thjeshtësuar siç e kërkove)
    
    // 6. LOGJIKA E MBYLLJES (ZION)
    // Letrat normale që mbetën pa u futur në asnjë SET
    const normalCardsLeft = normalCards.length - cardsInSets;
    
    // ZION: Xhokerat që kanë mbetur (tempJokers) mbulojnë letrat e mbetura
    const remainingCards = normalCardsLeft - tempJokers;

    // Rregulli: Mund të mbyllësh nëse ke 0 ose 1 letër jashtë grupeve
    if (remainingCards <= 1) {
        return true;
    }

    return false;
}
function pickCardFromDeck(newCardData) {
    // 1. Referencat e elementeve
    const deckElement = document.getElementById('deck-pile') || document.getElementById('deck-zion'); 
    const handContainer = document.getElementById('player-hand');
    
    // Siguria: Nëse diçka mungon, shtoje letrën pa animacion që mos të bllokohet loja
    if (!deckElement || !handContainer) {
        const alreadyExists = doraImeData.some(c => c.id === newCardData.id);
        if (!alreadyExists) {
            doraImeData.push(newCardData);
            renderHand();
        }
        return;
    }

    // 2. Krijo "fantazmën" e letrës për animacion
    const tempCard = document.createElement('div');
    tempCard.className = 'temp-animating'; // Sigurohu që e ke këtë në CSS
    
    const deckRect = deckElement.getBoundingClientRect();
    
    // Pozicioni fillestar (mbi dekun)
    Object.assign(tempCard.style, {
        position: 'fixed',
        left: deckRect.left + 'px',
        top: deckRect.top + 'px',
        width: '60px',  // Përshtate me madhësinë e letrave tua
        height: '90px',
        zIndex: '5000',
        transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(tempCard);

    // 3. Cakto pikën e mbërritjes (në fund të dorës sate)
    const handRect = handContainer.getBoundingClientRect();
    const targetLeft = handRect.right - 40; 
    const targetTop = handRect.top;

    // Nis fluturimin
    requestAnimationFrame(() => {
        tempCard.style.left = targetLeft + 'px';
        tempCard.style.top = targetTop + 'px';
        tempCard.style.transform = 'rotate(15deg) scale(0.8)';
        tempCard.style.opacity = '0.5';
    });

    // 4. Pasi mbaron fluturimi (600ms)
    setTimeout(() => {
        if (tempCard.parentNode) tempCard.remove();
        
        // Kontrollojmë nëse letra është shtuar tashmë (mbrojtje nga dublikimi)
        const alreadyExists = doraImeData.some(c => c.id === newCardData.id);
        
        if (!alreadyExists) {
            // SHTIMI KRITIK: E shtojmë letrën me ID-në origjinale të serverit
            doraImeData.push(newCardData);
            
            // Rifreskojmë pamjen e dorës
            renderHand();
            
            console.log("Letra e re u shtua në fund të renditjes ekzistuese.");
        }
    }, 600);
}

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

// ==========================================
// 6. HEDHJA E LETRËS (Discard)
// ==========================================

function processDiscard(cardElement) {
    if (!isMyTurn) return; // Mbrojtje e parë
    isMyTurn = false; // Bllokoje menjëherë radhën

    const cardId = cardElement.dataset.id; 
    const v = cardElement.dataset.v;
    const s = cardElement.dataset.s;

    if (!cardId) {
        console.error("GABIM: Letra nuk ka ID!");
        isMyTurn = true; // Ktheja radhën pasi dështoi
        renderHand();
        return;
    }

    const cardIndex = doraImeData.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
        // 1. Dërgojmë menjëherë sinjalin te serveri
        // Mos prit 400ms për socket-in, dërgoje tani!
        socket.emit('cardDiscarded', { v, s, id: cardId });

        const discardZone = document.getElementById('discard-pile');
        const rect = cardElement.getBoundingClientRect();
        const targetRect = discardZone.getBoundingClientRect();

        // Stilizimi për animacion
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
        
        // 2. Pas animacionit vetëm fshijmë elementin vizual
        setTimeout(() => {
            doraImeData.splice(cardIndex, 1); 
            
            if (cardElement.parentNode) cardElement.remove();
            
            renderHand(); 
            if (typeof checkZionCondition === "function") checkZionCondition();
        }, 400);

    } else {
        console.error("GABIM: Letra nuk u gjet! ID:", cardId);
        isMyTurn = true; // Ktheja radhën pasi nuk u gjet letra
        renderHand();
    }
}
// ==========================================
// 7. ASISTENTI ZION & TURN LOGIC (Pika 7, 15)
// ==========================================
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
function findAndRemoveSequence(suitCards, len, jokers) {
    // Rendisim letrat sipas cardOrder (e kemi definuar lart)
    const sorted = [...suitCards].sort((a, b) => cardOrder[a.v] - cardOrder[b.v]);

    // Provon dy mundësi për A-në: si 1 (A-2-3) dhe si 14 (10-J-Q-K-A)
    const acePositions = [1, 14]; 

    for (let aceVal of acePositions) {
        // Krijojmë një listë me vlerat numerike të letrave tona
        let values = sorted.map(c => (c.v === 'A' ? aceVal : cardOrder[c.v]));
        values = [...new Set(values)].sort((a, b) => a - b); // Heqim dublikatet (psh dy 7-sha rrush)

        // Shikojmë nëse mund të ndërtojmë një varg me gjatësinë 'len'
        for (let i = 0; i < values.length; i++) {
            let currentSeq = [];
            let tempJokers = jokers;
            let targetVal = values[i];

            for (let k = 0; k < len; k++) {
                let valToFind = targetVal + k;
                
                // RREGULLI: Nëse vargu kalon 14 (A e lartë), nuk lejohet të kthehet te 2
                if (valToFind > 14) break; 

                let cardFound = sorted.find(c => (c.v === 'A' ? aceVal : cardOrder[c.v]) === valToFind);

                if (cardFound) {
                    currentSeq.push(cardFound);
                } else if (tempJokers > 0) {
                    tempJokers--;
                    // Këtu imagjinojmë një xhoker, por ti s'ke, kështu që do dalë false
                } else {
                    break;
                }
            }

            if (currentSeq.length + (jokers - tempJokers) === len) {
                return {
                    usedCards: currentSeq,
                    jokersUsed: jokers - tempJokers
                };
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
    // 1. SHFAQJA E TABELËS MODALE (E re!)
    const modal = document.getElementById('score-modal');
    const tableBody = document.getElementById('score-body');
    if (modal && tableBody) {
        tableBody.innerHTML = ''; // Pastrojmë rreshtat e vjetër

        data.updatedPlayers.forEach(p => {
            const lastScore = p.history[p.history.length - 1]; // "X", "15", ose "30!"
            const isEliminated = p.score >= 71;
            
            // Përcaktojmë klasën për ngjyrën e pikëve (nëse ka "!" është Jackpot)
            let scoreClass = "";
            if (lastScore === 'X') scoreClass = "winner-x";
            else if (typeof lastScore === 'string' && lastScore.includes('!')) scoreClass = "jackpot-points";

            const row = document.createElement('tr');
            if (p.id === socket.id) row.className = 'active-row'; // Rreshti yt ndriçohet

            row.innerHTML = `
                <td class="${isEliminated ? 'eliminated' : ''}">${p.name}</td>
                <td class="${scoreClass}">${lastScore}</td>
                <td style="font-weight: bold;">${p.score} / 71</td>
                <td>${isEliminated ? '💀 I ELIMINUAR' : '✅ Në Lojë'}</td>
            `;
            tableBody.appendChild(row);
        });

        modal.style.display = 'flex'; // SHFAQET TABELA
    }

    // 2. LOGJIKA JOTE EKZISTUESE (E ruajtur plotësisht)
    console.log(`ZION! ${data.winnerName} e mbylli raundin!`);
    
    // Përditëso scoreboard-in anësor (nëse e ke atë funksion)
    if (typeof updateScoreboard === "function") {
        updateScoreboard(data.updatedPlayers, null);
    }

    // 3. Pastrimi i tavolinës (I ruajtur)
    doraImeData = [];
    renderHand();
    
    // Pastrojmë vizualisht elementet
    const discardPileElement = document.getElementById('discard-pile');
    if (discardPileElement) discardPileElement.innerHTML = '<span class="label">HEDH KËTU</span>';
    
    const jackpotElement = document.getElementById('jackpot');
    if (jackpotElement) jackpotElement.style.display = 'none';

    // 4. Kontrolli i mbylljes finale
    if (data.isGameOver) {
        alert(`Loja përfundoi! Fituesi final është: ${data.finalWinner}`);
    }

    // 5. AUTO-MBYLLJA E TABELËS (Pas 4 sekondave)
    setTimeout(() => {
        if (modal) modal.style.display = 'none';
    }, 4000);
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
    
    // RREGULLIMI 1: Ndryshojmë ID-në që të përputhet me HTML-në tënde
    const lobby = document.getElementById('lobby-controls'); 
    const table = document.getElementById('game-table');

    if (lobby) {
        // Përdorim style.display për siguri nëse klasa .hidden nuk punon
        lobby.style.display = 'none'; 
        lobby.classList.add('hidden');
    } else {
        console.warn("Elementi 'lobby-controls' nuk u gjet!");
    }

    if (table) {
        table.style.display = 'block';
        table.classList.remove('hidden');
    } else {
        console.warn("Elementi 'game-table' nuk u gjet!");
    }
});

socket.on('yourCards', (cards) => {
    console.log("Mora letrat e mia:", cards);
    if (cards && Array.isArray(cards)) {
        // Vetëm nëse dora është bosh e mbushim, përndryshe updateGameState merret me të
        if (doraImeData.length === 0) {
            doraImeData = cards.map((c, i) => ({...c, id: c.id || `${c.v}-${c.s}-${i}`}));
            renderHand();
        }
        checkZionCondition();    
    }
});

// --- FUNDI I SCRIPT.JS ---

// Sigurohemi që DOM është gati para se të aktivizojmë Sortable
document.addEventListener('DOMContentLoaded', () => {
    const handContainer = document.getElementById('player-hand');

    if (handContainer && typeof Sortable !== 'undefined') {
        new Sortable(handContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                // 1. Ndryshojmë renditjen në array (shumë e rëndësishme!)
                const movedCard = doraImeData.splice(evt.oldIndex, 1)[0];
                doraImeData.splice(evt.newIndex, 0, movedCard);
                
                // 2. Rifreskojmë vizatimin dhe kontrollojmë Zion-in
                renderHand();
                
                console.log("Renditja u përditësua në memorie!");
            }
        });
    }
});

console.log("Lidhja HTML -> Script: OK ✅");
