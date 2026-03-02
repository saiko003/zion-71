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

 // 6. Update i Letrave (I rregulluar me mbrojtje nga Dragging)
if (data.players) {
    const me = data.players.find(p => p.id === socket.id);
    if (me && me.cards) {
        
        // Kriojmë ID-të për letrat e serverit
        const serverCardsWithIds = me.cards.map((card, index) => ({
            ...card,
            id: card.id || `${card.v}-${card.s}-${index}` 
        }));

        // MBROJTJA: Nëse jam duke lëvizur një letër, mos e përditëso dorën nga serveri
        // sepse renditja lokale është ajo që ka rëndësi në atë moment.
        const isDraggingAnyCard = document.querySelector('.card.dragging');

        if (!isDraggingAnyCard) {
            // Kontrollojmë nëse ka ndryshim real (në numër ose në përmbajtje)
            const countChanged = !doraImeData || doraImeData.length !== serverCardsWithIds.length;
            
            if (countChanged || doraImeData.length === 0) {
                // Nëse po marrim letër të re (nga 10 në 11)
                if (doraImeData && serverCardsWithIds.length > doraImeData.length) {
                    const newCard = serverCardsWithIds.find(sc => !doraImeData.some(my => my.id === sc.id));
                    if (newCard) {
                        doraImeData.push(newCard);
                    } else {
                        doraImeData = [...serverCardsWithIds];
                    }
                } 
                // Nëse po gjuajmë letër ose reset i plotë
                else {
                    doraImeData = [...serverCardsWithIds];
                }

                console.log("Serveri përditësoi dorën:", doraImeData.length);
                renderHand();
            }
        } else {
            console.log("Update i dorës u injorua sepse jeni duke lëvizur një letër.");
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
    animateCardDraw();

    // 1. I japim letrës së re një ID unike që të mos ngatërrohet me të tjerat
    const cardWithId = {
        ...newCard,
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    };

    // 2. E shtojmë në fund të dorës sate (kështu nuk preken ato që i ke rendit vetë)
    doraImeData.push(cardWithId);

    // 3. Vizatojmë dorën dhe kontrollojmë Zion-in
    renderHand();
    
    // Nëse checkZionCondition() e ke brenda renderHand, 
    // rreshtin më poshtë mund ta fshish fare.
    checkZionCondition(); 
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
        div.dataset.id = card.id || `${card.v}-${card.s}-${index}`; 

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
        
        div.addEventListener('mousedown', onDragStart);
        div.addEventListener('touchstart', onDragStart, { passive: false });

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
    
    // Lëvizja e letrës reale (ndjek gishtin 1:1)
    dragElement.style.left = (t.clientX - parseFloat(dragElement.dataset.offsetX)) + 'px';
    dragElement.style.top = (t.clientY - parseFloat(dragElement.dataset.offsetY)) + 'px';

    // Lëvizja e Placeholder-it brenda dorës
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

    const t = e.type.includes('touch') ? (e.changedTouches[0] || e.touches[0]) : e;
    const pile = document.getElementById('discard-pile');
    const victoryZone = document.getElementById('victory-drop-zone');
    const handContainer = document.getElementById('player-hand');
    const tolerance = 50;

    let isOverPile = false;
    let isOverVictory = false;

    // 1. Detektimi i zonave (Logjika jote origjinale)
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
            if (placeholder) placeholder.remove();
            socket.emit('declareZion', { 
                discardedCard: { v: dragElement.dataset.v, s: dragElement.dataset.s },
                hand: doraImeData.filter(c => c.id !== dragElement.dataset.id)
            });
            finalizeCleanup();
            dragElement = null;
            placeholder = null;
            return;
        }
    } 

    // 3. KUSHTI PËR HEDHJE (Discard)
    if (isOverPile && isMyTurn && doraImeData.length === 11) {
        if (placeholder) placeholder.remove();
        processDiscard(dragElement);
    } else {
        // 4. KTHIMI DHE RUAJTJA (Nëse nuk u hodh)
        if (placeholder && placeholder.parentNode) {
            // E vendosim letrën ekzaktesisht te vendi që i ruajti placeholder-i
            placeholder.parentNode.insertBefore(dragElement, placeholder);
        } else if (dragElement.parentNode !== handContainer) {
            handContainer.appendChild(dragElement);
        }

        if (placeholder) placeholder.remove();

        // Pastrojmë stilet
        Object.assign(dragElement.style, {
            position: '', zIndex: '', pointerEvents: '', 
            width: '', height: '', left: '', top: '',
            margin: '', transform: '', transition: ''
        });
        dragElement.classList.remove('dragging');

        // RUAJTJA E RENDITJES
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
    // 1. Marrim të dhënat nga DOM
    const cardId = cardElement.dataset.id; 
    const v = cardElement.dataset.v;
    const s = cardElement.dataset.s;

    // DEBUG: Shiko në konsolë (F12) nëse ID vjen e saktë
    console.log("Duke provuar hedhjen:", {v, s, cardId});

    // 2. Gjejmë indeksin në array-n e të dhënave
    const cardIndex = doraImeData.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
        isMyTurn = false; // Vetëm tani e bllokojmë radhën

        const discardZone = document.getElementById('discard-pile');
        const rect = cardElement.getBoundingClientRect();
        const targetRect = discardZone.getBoundingClientRect();

        // Stilizimi për animacion (letrën e kemi te body)
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
            doraImeData.splice(cardIndex, 1); 
            socket.emit('cardDiscarded', { v, s, id: cardId });
            
            // SHUMË E RËNDËSISHME: Hiqe elementin nga body pasi mbaron animacioni
            if (cardElement.parentNode) cardElement.remove();
            
            renderHand(); 
            if (typeof checkZionCondition === "function") checkZionCondition();
        }, 400);
    } else {
        console.error("GABIM: Letra nuk u gjet në listë! ID:", cardId);
        isMyTurn = true;
        renderHand(); // Rindërto dorën që të mos mbetet letra te body
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
    console.log("Mora letrat e mia nga serveri:", cards);
    if (cards && Array.isArray(cards)) {
        doraImeData = cards; 
        renderHand();        
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
