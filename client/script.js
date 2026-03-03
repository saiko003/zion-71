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
const deckElement = document.getElementById('deck-zion') || document.getElementById('deck');
let gameStarted = false;
let isMyTurn = false;
let doraImeData = [];
let isDraggingCard = false; 
let tookJackpotThisTurn = false;
let placeholder = null;
socket.on('lobbyMessage', (msg) => {
    const lobbyText = document.getElementById('lobby-text');
    if (lobbyText) lobbyText.innerText = msg;
});
const cardOrder = {
    'A': 1,  // E llogarisim si 1 fillimisht
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13
};

function getVal(card, highAce = false) {
    const v = card.v;
    
    // Kontrolli për Xhokerin (për siguri)
    if (['★', 'Jokeri', 'Xhoker'].includes(v)) return 0;

    if (v === 'A') return highAce ? 14 : 1; 
    if (v === 'J') return 11;
    if (v === 'Q') return 12;
    if (v === 'K') return 13;
    
    return parseInt(v) || 0;
}

// 1. LIDHJA E BUTONIT START
const btnstart = document.getElementById('btn-start');
if (btnstart) {
    // Përdorim onclick që të jemi 100% sigurt që ka vetëm 1 funksion lidhës
    btnstart.onclick = () => {
        console.log("🚀 Po dërgoj startGame te serveri...");
        socket.emit('startGame');
    };
}

// 2. LIDHJA E DEKUT (ZION) - Vetëm 1 herë!
const deckZion = document.getElementById('deck-zion') || document.getElementById('deck-pile');

if (deckZion) {
    deckZion.onclick = () => {
        console.log("Klikuar mbi dekun...");

        // Logjika e saktë: Radha jote dhe 10 letra
        if (isMyTurn && doraImeData.length === 10) {
            // tookJackpotThisTurn = false; // Nëse e përdor këtë variabël
            socket.emit('drawCard');
            console.log("✅ Kërkesa u dërgua: drawCard");
            
            // Heqim shkëlqimin menjëherë që lojtari të mos klikojë përsëri deri në update-in tjetër
            deckZion.classList.remove('active-deck');
        } 
        else if (isMyTurn && doraImeData.length === 11) {
            alert("Ti e ke marrë letrën! Tani duhet të hedhësh një në tokë.");
        }
        else if (!isMyTurn) {
            console.warn("Prit radhën tënde!");
        }
    };
}
// 1. Dëgjuesi për përditësimin e përgjithshëm të lojës
socket.on('updateGameState', (data) => {
    console.log("Mora statusin e ri:", data);
    updateGameFlow(data);
});

// 2. Dëgjuesi për marrjen e letrave (Fillimi i lojës ose pas Draw)
socket.on('yourCards', (cards) => {
    console.log("Letrat erdhën:", cards);
    doraImeData = cards;
    
    // Në vend që të thërrasim renderHand() vetëm, thërrasim updateGameFlow.
    // Kjo siguron që edhe Status Message (Hidh/Tërhiq) përditësohet menjëherë.
    updateGameFlow({ myCards: cards }); 
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

// 3. Mbushim rreshtat (Versioni i përmirësuar vizualisht)
scoreBody.innerHTML = '';
players.forEach(player => {
    const row = document.createElement('tr');
    
    // Klasat për stilim
    if (player.id === activeId) row.classList.add('active-row');
    if (player.isOut || player.score >= 71) row.classList.add('eliminated'); 

    let nameCell = `<td>${player.name} ${player.id === socket.id ? '<small>(Ti)</small>' : ''}</td>`;
    
    let historyCells = '';
    for (let i = 0; i < maxRounds; i++) {
        let pikaRaundi = (player.history && player.history[i] !== undefined) ? player.history[i] : '-';
        
        // Stilim special për "X" (fitoren) dhe "!" (Jackpot)
        let cellStyle = "";
        if (pikaRaundi === "X") cellStyle = 'style="color: #2ecc71; font-weight: bold;"';
        if (typeof pikaRaundi === "string" && pikaRaundi.includes("!")) {
            cellStyle = 'style="color: #e74c3c; font-weight: bold;"';
        }

        historyCells += `<td ${cellStyle}>${pikaRaundi}</td>`;
    }

    let totalCell = `<td><strong>${player.score}</strong></td>`;
    
    row.innerHTML = nameCell + historyCells + totalCell;
    scoreBody.appendChild(row);
});
}
// KËTU dëgjojmë serverin
socket.on('updateGameState', (data) => {
    console.log("Mora gjendjen e re të lojës:", data);
    
    // THIRRJA E FUNKSIONIT TËND
    updateGameFlow(data);
});
function updateGameFlow(data) {
    // 1. Sigurohemi që 'data' nuk është null
    if (!data) data = {};



if (data.myCards && Array.isArray(data.myCards)) {
    // 1. Nëse numri i letrave është i NJËJTË (psh. 10 me 10)
    if (doraImeData.length === data.myCards.length) {
        // MOS BËJ ASGJË. 
        // Mos e prek doraImeData sepse lojtari sapo i ka rregulluar vetë.
        return; 
    } 
    
    // 2. Nëse numri ka ndryshuar (ke marrë ose hedhur letër)
    if (doraImeData.length === 0 || Math.abs(doraImeData.length - data.myCards.length) > 1) {
        doraImeData = data.myCards;
        renderHand();
    } else if (doraImeData.length < data.myCards.length) {
        // Ke marrë letër: Shtoje vetëm atë që mungon në fund
        const newCard = data.myCards.find(sc => !doraImeData.some(lc => lc.id === sc.id));
        if (newCard) {
            doraImeData.push(newCard);
            renderHand();
        }
    } else {
        // Ke hedhur letër: Prano listën e re
        doraImeData = data.myCards;
        renderHand();
    }
}

// 3. LOGJIKA E RADHËS (ZHBLLOKIMI)
if (data.activePlayerId) {
    // Radha përcaktohet VETËM nga serveri
    isMyTurn = (data.activePlayerId === socket.id);
} 

// Korigjim: Nëse kam 11 letra, UNË duhet të hedh, pavarësisht çka thotë activePlayerId
if (doraImeData.length === 11) {
    isMyTurn = true;
}
    // 4. VIZUALIZIMI I RADHËS (Glow)
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // 5. KONTROLLI I DECK-UT (SHKËLQIMI)
    const deck = document.getElementById('deck-zion') || document.getElementById('deck');
    if (deck) {
        const duhetTeTerheq = isMyTurn && doraImeData.length === 10;
        
        if (duhetTeTerheq) {
            deck.classList.add('active-deck');
            deck.style.pointerEvents = "auto";
            deck.style.cursor = "pointer";
        } else {
            deck.classList.remove('active-deck');
            deck.style.pointerEvents = "none";
            deck.style.cursor = "default";
        }
    }

    // 6. JACKPOT
    const jackpot = document.getElementById('jackpot');
    if (jackpot && data.jackpotCard) {
        const isRed = ['♥', '♦'].includes(data.jackpotCard.s);
        jackpot.innerHTML = `
            <div class="v">${data.jackpotCard.v}</div>
            <div class="s">${data.jackpotCard.s}</div>
        `;
        jackpot.style.color = isRed ? '#e74c3c' : '#2c3e50';
    }

    // 7. STATUS MESSAGE
    const statusMsg = document.getElementById('status-message') || document.getElementById('status-teksti');
    if (statusMsg) {
        if (isMyTurn) {
            statusMsg.innerText = (doraImeData.length === 10) ? "Tërhiq një letër!" : "Hidh një letër!";
            statusMsg.style.color = "#2ecc71"; // Jeshile
        } else {
            statusMsg.innerText = "Pret radhën...";
            statusMsg.style.color = "#bdc3c7"; // Gri
        }
    }

    // 8. RINDËRTIMI I DORËS
    // E thërrasim VETËM nëse kemi letra për të vizatuar
    if (typeof renderHand === "function" && doraImeData.length > 0) {
        renderHand();
    }
}

socket.on('cardDrawn', (newCard) => {
    console.log("=== EVENT: cardDrawn ===");
    
    // 1. KONTROLLI I SIGURISË (Mos e shto nëse ekziston)
    const exists = doraImeData.some(c => c.id === newCard.id);
    
    if (!exists) {
        // 2. THIRR ANIMACIONIN
        // Ky funksion do të bëjë doraImeData.push(newCard) automatikisht
        pickCardFromDeck(newCard); 
        console.log("Letra e re u dërgua te animacioni.");
    } else {
        console.warn("Kujdes: Kjo letër ekziston një herë në dorë!");
    }

    // 3. KONTROLLI I ZION-IT (Me vonesë që të përfundojë animacioni)
    setTimeout(() => {
        if (typeof checkZionCondition === "function") {
            checkZionCondition();
        }
    }, 700);
});

function checkZionCondition() {
    const btnMbyll = document.getElementById('btn-mbyll');
    const statusDrita = document.getElementById('status-drita');
    const statusTeksti = document.getElementById('status-teksti');

    if (!btnMbyll) return;

    // 1. KUSHTI I RADHËS DHE NUMRIT TË LETRAVE
    if (isMyTurn && doraImeData.length === 11) {
        
        let mundTeMbyllet = false;

        // 2. PROVOJMË SECILËN LETËR SI LETËR MBYLLËSE
        // Kjo bën që isDoraValid të marrë 10 letra saktësisht
        for (let i = 0; i < doraImeData.length; i++) {
            let testHand = [...doraImeData];
            let removedCard = testHand.splice(i, 1)[0];

            // Xhokeri nuk mund të përdoret si letër mbyllëse
            if (['★', 'Jokeri', 'Xhoker'].includes(removedCard.v)) continue;

            if (isDoraValid(testHand)) {
                mundTeMbyllet = true;
                break; 
            }
        }

        // 3. SHFAQJA E BUTONIT DHE STATUSIT
        if (mundTeMbyllet) {
            btnMbyll.style.display = 'block';
            btnMbyll.style.background = "#2ecc71"; // Jeshile
            btnMbyll.innerHTML = "MBYLL LOJËN (ZION)";
            
            if (statusDrita) statusDrita.className = 'led-green';
            if (statusTeksti) {
                statusTeksti.innerText = (typeof tookJackpotThisTurn !== 'undefined' && tookJackpotThisTurn) 
                    ? "ZION (X2)! Mbyllu." 
                    : "ZION! Mund të mbyllesh.";
            }
        } else {
            // Radha jote, ke 11 letra, por NUK janë të rregulluara mirë
            btnMbyll.style.display = 'none';
            if (statusDrita) statusDrita.className = 'led-orange'; 
            if (statusTeksti) statusTeksti.innerText = "Rregullo grupet (3 ose 4 letra)...";
        }

    } else {
        // Kur nuk është radha ose nuk ke 11 letra
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
    console.log("--- DEBUG: renderHand nisi ---");
    const handContainer = document.getElementById('player-hand');
    
    // 1. KONTROLLI I PARË: A ekziston elementi?
    if (!handContainer) {
        console.error("GABIM: Nuk u gjet elementi me ID 'player-hand' në HTML!");
        return;
    }

    // 2. KONTROLLI I DYTË: A ka letra?
    if (!doraImeData || doraImeData.length === 0) {
        console.warn("KUJDES: doraImeData është bosh. Nuk kam çfarë të vizatoj.");
        handContainer.innerHTML = ""; // Sigurohemi që është pastër
        return;
    }

    console.log("Duke vizatuar", doraImeData.length, "letra...");

    // Pastrojmë mbetjet vizuale te body (letrat që mbeten pezull gjatë drag-and-drop)
    const ghostCards = document.querySelectorAll('body > .card.dragging');
    ghostCards.forEach(card => card.remove());

    // Pastrojmë kontejnerin para rindërtimit
    handContainer.innerHTML = '';

    doraImeData.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        
        // Datasetet për identifikim dhe logjikë
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;
        div.dataset.id = card.id || `card-${card.v}-${card.s}-${index}`;

        // Pamja e letrës (Xhoker/Zion apo Letër normale)
        if (card.v === '★' || card.v === 'Xhoker') {
            div.classList.add('joker');
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
        } else {
            div.innerHTML = `${card.v}<br>${card.s}`;
            // Ngjyrosja e letrave të kuqe (Zemër dhe Kokëshqollë)
            if (['♥', '♦'].includes(card.s)) {
                div.style.color = 'red';
            }
        }
        
        // Resetimi i stileve inline për t'u siguruar që letrat rreshtohen saktë në kontejner
        Object.assign(div.style, {
            position: '', 
            left: '', 
            top: '', 
            zIndex: ''
        });
         
        // Lidhja e eventeve për lëvizjen e letrave
        div.onmousedown = onDragStart;
        div.ontouchstart = (e) => onDragStart(e);

        handContainer.appendChild(div);
    });

    console.log("--- DEBUG: renderHand përfundoi ---");
    
    // Kontrolli i kushtit Zion pas çdo vizatimi
    if (typeof checkZionCondition === "function") {
        checkZionCondition();
    }
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

    // 1. KORRIGJIMI PËR TOUCH/MOUSE
    const t = e.type.includes('touch') ? 
              (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : e.touches[0]) : 
              e;

    const pile = document.getElementById('discard-pile');
    if (pile) pile.classList.remove('drag-over');

    const victoryZone = document.getElementById('victory-drop-zone');
    const handContainer = document.getElementById('player-hand');
    const tolerance = 60; 

    // Heqja e eventeve
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchend', onDragEnd);

    // KORRIGJIM: Lirojmë mausin menjëherë që të mos "ngjisë"
    dragElement.style.pointerEvents = 'auto'; 
    dragElement.classList.remove('dragging');

    let isOverPile = false;
    let isOverVictory = false;

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

    // 2. KUSHTI PËR ZION (KORRIGJUAR)
if (isOverVictory && isMyTurn && doraImeData.length === 11) {
    if (confirm("A dëshiron të mbyllësh lojën (ZION)?")) {
        
        // MOS e filtro dorën këtu. Dërgoje të plotë me 11 letra 
        // që serveri t'i testojë të gjitha kombinimet.
        socket.emit('declareZion', { 
            isJackpotClosing: false // ose true nese ke buton specifik
        });

        // Pastrim i menjëhershëm i ndërfaqes
        isMyTurn = false;
        if (placeholder) placeholder.remove();
        
        // Fshijmë elementin vizualisht
        if (dragElement && dragElement.parentNode) {
            dragElement.parentNode.removeChild(dragElement);
        }

        finalizeCleanup();
        dragElement = null;
        placeholder = null;
        return; 
    }
}

    // 3. KUSHTI PËR HEDHJE NË STIVË
    if (isOverPile && isMyTurn && doraImeData.length === 11) {
        // Shënim: isMyTurn = false bëhet brenda processDiscard
        if (placeholder) placeholder.remove();
        
        dragElement.style.position = '';
        processDiscard(dragElement); 
        
} else {
        // 4. KTHIMI NË DORË DHE RUAJTJA E RENDITJES
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(dragElement, placeholder);
        } else if (dragElement.parentNode !== handContainer) {
            handContainer.appendChild(dragElement);
        }

        if (placeholder) placeholder.remove();

        // 1. I japim stilet për animacionin e kthimit
        Object.assign(dragElement.style, {
            position: '', zIndex: '', pointerEvents: 'auto', 
            width: '', height: '', left: '', top: '',
            margin: '', transform: '', transition: 'all 0.2s ease'
        });

        // 2. KËTU NDRYSHIMI: Lexojmë renditjen direkt nga DOM
        const currentCards = [...handContainer.querySelectorAll('.card')];
        
        // Kjo e bën doraImeData saktësisht siç e sheh lojtari në ekran
        doraImeData = currentCards.map(c => ({
            v: c.dataset.v,
            s: c.dataset.s,
            id: c.dataset.id
        }));

        console.log("Renditja e re u ruajt lokalisht:", doraImeData.map(c => c.v));
        if (typeof checkZionCondition === "function") checkZionCondition();
        
        // 3. I japim pak kohë animacionit dhe pastaj bëjmë renderHand
        // Përdorim një variabël që tregon se po bëjmë renditje manuale
        const tempElement = dragElement; 
        setTimeout(() => {
            if (tempElement) tempElement.style.transition = '';
            // Nuk thërrasim renderHand() nëse nuk është e nevojshme 
            // sepse DOM-i tashmë është në rregull nga insertBefore
        }, 200);
    }
    
    // Pastrim i variablave globale të drag-ut
    dragElement = null; 
    placeholder = null;
    if (typeof finalizeCleanup === "function") finalizeCleanup();
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
// 1. FUNKSIONI NDihmës PËR KONTROLLIN E DORËS
// ==========================================
function isDoraValid(cards) {
    if (!cards || cards.length === 0) return true;

    // 1. Ndajmë Xhokerat nga letrat normale
    let jokers = cards.filter(c => ['★', 'Jokeri', 'Xhoker'].includes(c.v)).length;
    let normalCards = cards.filter(c => !['★', 'Jokeri', 'Xhoker'].includes(c.v));

    // 2. Renditja fillestare (Asi si 1)
    normalCards.sort((a, b) => {
        if (a.s !== b.s) return a.s.localeCompare(b.s);
        return getVal(a, false) - getVal(b, false);
    });

    function solve(remaining, jks) {
        if (remaining.length === 0) return true;

        let first = remaining[0];
        console.log("Duke provuar grupin për:", first.v, first.s, "Xhokera mbetur:", jks);

        // --- A. PROVOJMË SET (7-7-7 ose 7-7-7-7) ---
        let sameValue = remaining.filter(c => c.v === first.v);
        // Provon madhësitë 4 pastaj 3 (prioritet katërshes)
        for (let size of [4, 3]) {
            let maxNormal = Math.min(sameValue.length, size);
            for (let n = maxNormal; n >= 1; n--) {
                let jNeeded = size - n;
                if (jNeeded <= jks) {
                    let nextCards = [...remaining];
                    let removed = 0;
                    // Heqim vetëm n letra me vlerë të njëjtë
                    let filtered = [];
                    for (let c of nextCards) {
                        if (removed < n && c.v === first.v) {
                            removed++;
                        } else {
                            filtered.push(c);
                        }
                    }
                    if (solve(filtered, jks - jNeeded)) return true;
                }
            }
        }

        // --- B. PROVOJMË VARG (5-6-7, 3-4-★, ose Q-K-A) ---
        for (let size = 3; size <= 5; size++) {
            let currentJks = jks;
            let tempRemaining = [...remaining];
            let firstVal = getVal(first, false); // Startojmë vargun
            let suit = first.s;
            
            let possible = true;
            tempRemaining.shift(); // Heqim letrën e parë

            for (let i = 1; i < size; i++) {
                let targetVal = firstVal + i;
                
                // Gjejmë nëse e kemi letrën target në tempRemaining
                let idx = tempRemaining.findIndex(c => {
                    // Kjo është pjesa kritike: nëse kërkojmë 14, getVal duhet ta shohë A si 14
                    let v = getVal(c, targetVal === 14); 
                    return v === targetVal && c.s === suit;
                });

                if (idx !== -1) {
                    tempRemaining.splice(idx, 1);
                } else if (currentJks > 0) {
                    currentJks--; // Përdorim xhokerin
                } else {
                    possible = false;
                    break;
                }
            }

            if (possible && solve(tempRemaining, currentJks)) return true;
        }

        return false;
    }

    return solve(normalCards, jokers);
}
function pickCardFromDeck(newCardData) {
    // 1. Referencat e elementeve (I deklarojmë vetëm NJË HERË këtu)
    const deckElement = document.getElementById('deck-zion') || document.getElementById('deck-pile') || document.getElementById('deck'); 
    const handContainer = document.getElementById('player-hand');
    
    // --- KËTU SHTOJMË LOGJIKËN E GLOW (Pa konstante të reja) ---
    if (deckElement) {
        const myTurn = typeof isMyTurn !== 'undefined' ? isMyTurn : false;
        // Kontrollojmë gjendjen: nëse kam 10 letra, bëj glow që lojtari të dijë të tërheqë
        if (myTurn && doraImeData.length === 10) {
            deckElement.classList.add('deck-glow');
        } else {
            deckElement.classList.remove('deck-glow');
        }
    }

    // Siguria: Nëse diçka mungon, shtoje letrën pa animacion
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
    tempCard.className = 'temp-animating'; 
    
    const deckRect = deckElement.getBoundingClientRect();
    
    Object.assign(tempCard.style, {
        position: 'fixed',
        left: deckRect.left + 'px',
        top: deckRect.top + 'px',
        width: '60px',
        height: '90px',
        zIndex: '5000',
        backgroundColor: 'white', // Ose imazhi i prapmë i letrës
        borderRadius: '5px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(tempCard);

    // 3. Cakto pikën e mbërritjes
    const handRect = handContainer.getBoundingClientRect();
    const targetLeft = handRect.right - 40; 
    const targetTop = handRect.top;

    requestAnimationFrame(() => {
        tempCard.style.left = targetLeft + 'px';
        tempCard.style.top = targetTop + 'px';
        tempCard.style.transform = 'rotate(15deg) scale(0.8)';
        tempCard.style.opacity = '0.5';
    });

// 4. PAS ANIMACIONIT
    setTimeout(() => {
        if (tempCard.parentNode) tempCard.remove();
        
        // KONTROLLI I SIGURISË
        const alreadyExists = doraImeData.some(c => c.id === newCardData.id);
        
        if (!alreadyExists) {
            doraImeData.push(newCardData);
            
            // RENDITJA (Opsionale: I rendit letrat që mos të bëhen rrëmujë)
            // doraImeData.sort((a, b) => cardOrder[a.v] - cardOrder[b.v]); 

            renderHand();
            
            // HEQIM GLOW - E rëndësishme: Tani ka 11 letra, duhet të HEDHË
            if (deckElement) {
                deckElement.classList.remove('deck-glow');
                deckElement.classList.remove('active-deck'); // Hiq çdo klasë tjetër shkëlqimi
            }

            // SHTO KËTË: Kontrollo menjëherë nëse me këtë letër u bë ZION
            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
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
    if (!isMyTurn) return; 
    isMyTurn = false; 

    const cardId = cardElement.dataset.id; 
    const cardIndex = doraImeData.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
        const letraObjekt = doraImeData[cardIndex]; 

        // KORRIGJIM: E fshijmë nga array menjëherë që renderHand mos ta vizatojë prapë
        doraImeData.splice(cardIndex, 1); 

        socket.emit('discardCard', letraObjekt);

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
            // KORRIGJIM: Krijojmë kopjen vizuale te stiva (Pika 11)
            const visualDiscard = document.createElement('div');
            visualDiscard.className = 'card discarded-static';
            visualDiscard.innerHTML = cardElement.innerHTML;
            visualDiscard.style.color = cardElement.style.color;
            
            const randomRot = Math.floor(Math.random() * 40) - 20; 
            visualDiscard.style.transform = `translate(-50%, -50%) rotate(${randomRot}deg)`;
            
            if (discardZone.children.length >= 3) {
                discardZone.removeChild(discardZone.firstChild);
            }
            discardZone.appendChild(visualDiscard);

            if (cardElement.parentNode) cardElement.remove();
            
            renderHand(); 
            
            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
        }, 400);

    } else {
        console.error("GABIM: Letra nuk u gjet lokalisht! ID:", cardId);
        isMyTurn = true; 
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


document.getElementById('btn-mbyll').addEventListener('click', () => {
    // 1. Kontrolli i radhës dhe letrave
    if (!isMyTurn || doraImeData.length !== 11) {
        alert("Nuk mund të mbyllësh! Duhet të kesh 11 letra dhe të jetë radha jote.");
        return;
    }

    if (confirm("A dëshiron të mbyllësh lojën (ZION)?")) {
        // 2. KORRIGJIMI: Emri i eventit duhet të jetë 'declareZion'
        // Nuk kemi nevojë të dërgojmë letrat sepse serveri i ka ato
        socket.emit('declareZion', { 
            isJackpotClosing: (typeof tookJackpotThisTurn !== 'undefined') ? tookJackpotThisTurn : false 
        });

        // 3. Fshehim butonin që mos të klikohet dy herë
        document.getElementById('btn-mbyll').style.display = 'none';
        isMyTurn = false; 
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


function checkRecursive(cards, jokers) {
    if (cards.length === 0) return true;

    // Rendisim letrat që të gjejmë rradhët më lehtë
    cards.sort((a, b) => getValForSequence(a) - getValForSequence(b));

    const first = cards[0];

    // --- 1. PROVO GRUPIN (Vlera e njëjtë) ---
    const sameValue = cards.filter(c => c.v === first.v);
    for (let size = 3; size <= 4; size++) {
        for (let jUsed = 0; jUsed <= jokers; jUsed++) {
            let normalNeeded = size - jUsed;
            if (normalNeeded > 0 && normalNeeded <= sameValue.length) {
                const used = sameValue.slice(0, normalNeeded);
                const remaining = cards.filter(c => !used.includes(c));
                if (checkRecursive(remaining, jokers - jUsed)) return true;
            }
        }
    }

    // --- 2. PROVO RRADHËN (Simbol i njëjtë) ---
    const sameSuit = cards.filter(c => c.s === first.s);
    if (sameSuit.length + jokers >= 3) {
        // Provojmë gjatësi vargu nga 3 deri në 10
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

// Kur një lojtar mbyll lojën (ZION!)
socket.on('roundOver', (data) => {
    // Referencat sipas HTML-së tënde
    const modal = document.getElementById('round-modal');
    const tableBody = document.getElementById('score-body');
    
    if (modal && tableBody) {
        tableBody.innerHTML = ''; // Pastrojmë rreshtat e vjetër

        data.updatedPlayers.forEach(p => {
            const lastScore = p.history[p.history.length - 1]; // "X", "15", ose "30!"
            const isEliminated = p.isOut; // Përdorim variablin nga serveri
            
            let scoreClass = "";
            if (lastScore === 'X') scoreClass = "winner-x";
            else if (typeof lastScore === 'string' && lastScore.includes('!')) scoreClass = "jackpot-points";

            const row = document.createElement('tr');
            if (p.id === socket.id) row.className = 'active-row'; // Rreshti yt

            row.innerHTML = `
                <td class="${isEliminated ? 'eliminated' : ''}">${p.name}</td>
                <td class="${scoreClass}">${lastScore}</td>
                <td style="font-weight: bold;">${p.score} / 71</td>
                <td>${isEliminated ? '💀 I ELIMINUAR' : '✅ Në Lojë'}</td>
            `;
            tableBody.appendChild(row);
        });

        modal.style.display = 'flex'; // Shfaqim modalin (overlay-in)
    }

    // Pastrojmë dorën dhe tavolinën vizualisht
    doraImeData = [];
    renderHand();
    
    // Pastrojmë discard pile (stivën e hedhjes)
    const discardPileElement = document.getElementById('discard-pile');
    if (discardPileElement) {
        discardPileElement.innerHTML = '<span class="label">ZION 71</span>';
    }

    // Mbyllim tabelën automatikisht pas 4.5 sekondave (pak para se të vijë raundi i ri)
    setTimeout(() => {
        if (modal) modal.style.display = 'none';
    }, 4500);
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

/* ==========================================
   EVENTI: MARRJA E LETRAVE (yourCards)
   Ky event thirret kur serveri të ndan letrat
   ========================================== */
socket.on('yourCards', (cards) => {
    console.log("DEBUG: Eventi yourCards u thirr. Letrat e marra:", cards);
    
    // Kontrollojmë nëse të dhënat janë të vlefshme
    if (cards && Array.isArray(cards) && cards.length > 0) {
        
        // 1. NDRYSHIMI I PAMJES (Nga Lobby te Tavolina)
        const gameTable = document.getElementById('game-table');
        const lobby = document.getElementById('lobby-controls');
        
        // Sigurohemi që tabela është e dukshme para se të vizatojmë
        if (gameTable) {
            gameTable.style.display = 'block';
            // Shtojmë një klasë në body nëse duam stile specifike për lojën aktive
            document.body.classList.add('game-active');
        }
        
        if (lobby) {
            lobby.style.display = 'none';
        }
        
        // 2. RUAJTJA DHE FORMATIMI I LETRAVE
        // Pastrojmë array-n e vjetër dhe mbushim me të dhënat e reja
        doraImeData = cards.map((c, i) => ({
            ...c, 
            // Gjenerojmë një ID unike nëse serveri nuk e ka dërguar një të tillë
            // Kjo i duhet SortableJS dhe funksionit të lëvizjes (drag)
            id: c.id || `${c.v}-${c.s}-${i}-${Math.random().toString(36).substring(2, 6)}`
        }));
        
        console.log("DEBUG: doraImeData u mbush me sukses. Numri i letrave:", doraImeData.length);
        
        // 3. VIZATIMI I DORËS
        // Përdorim setTimeout për t'i dhënë kohë browser-it të bëjë "render" tabelën
        setTimeout(() => {
            // Vizatojmë letrat në HTML
            if (typeof renderHand === "function") {
                renderHand();
            } else {
                console.error("GABIM: Funksioni renderHand() nuk u gjet!");
            }
            
            // Kontrollojmë nëse lojtari ka bërë Zion (71 pikë) automatikisht
            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
        }, 100); // 100ms është vonesa ideale për stabilitet

    } else {
        // Nëse serveri dërgon listë bosh (p.sh. pas një gabimi)
        console.error("GABIM KRITIK: Serveri dërgoi 'yourCards' por data ishte e zbrazët ose korruptuar!");
        
        // Opsionale: mund të rifreskojmë pamjen që të mos mbeten letra fantazmë
        doraImeData = [];
        if (typeof renderHand === "function") renderHand();
    }
});

// --- FUNDI I SCRIPT.JS ---

// Sigurohemi që DOM është gati para se të aktivizojmë Sortable
document.addEventListener('DOMContentLoaded', () => {
    const handContainer = document.getElementById('player-hand');
    const discardPile = document.getElementById('discard-pile');

    // 1. Instanca për dorën e lojtarit
    new Sortable(handContainer, {
        group: {
            name: 'zion-game',
            pull: true,  // Lejon nxjerrjen e letrës nga dora
            put: false   // Nuk lejon futjen e letrave nga jashtë (p.sh. nga deku) me drag
        },
        animation: 150,
        ghostClass: 'sortable-ghost',
onEnd: function (evt) {
    // 1. Marrim të gjitha letrat nga HTML saktësisht si janë radhitur pas drag-ut
    const cardElements = Array.from(document.querySelectorAll('#player-hand .card'));
    
    // 2. Rindërtojmë array-un tonë nga zero duke u bazuar në HTML
    doraImeData = cardElements.map(el => ({
        v: el.dataset.v,
        s: el.dataset.s,
        id: el.dataset.id
    }));

    console.log("Renditja u 'gozhdua' në memorie:", doraImeData.map(c => c.v));
    
    // 3. SHUMË E RËNDËSISHME: Njofto serverin për renditjen e re
    // Nëse nuk e bën këtë, serveri do të të dërgojë renditjen e vjetër prapë
    socket.emit('update_my_hand_order', doraImeData);
}    
    });

    // 2. Instanca për zonën e hedhjes (HEDH KËTU)
    new Sortable(discardPile, {
        group: 'zion-game', // I njëjti emër grupi
        onAdd: function (evt) {
            // Ky funksion thirret kur lëshon letrën te "HEDH KËTU"
            const cardEl = evt.item;
            const v = cardEl.dataset.v;
            const s = cardEl.dataset.s;

            // 1. Largojmë letrën vizualisht (sepse do ta bëjmë render përsëri)
            cardEl.remove();

            // 2. Thërrasim funksionin tënd ekzistues që njofton serverin
            // Supozojmë se emri i funksionit është hedhLetren(vlerë, shenjë)
            if (typeof hedhLetren === "function") {
                hedhLetren(v, s); 
            }
            
            console.log(`U hodh letra: ${v} ${s}`);
        }
    });
});

console.log("Lidhja HTML -> Script: OK ✅");
