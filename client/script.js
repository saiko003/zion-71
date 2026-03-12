// ==========================================
// ZION 71 - SCRIPT I RREGULLUAR PËR MOBILE
// ==========================================

const socket = io('https://zion-71.onrender.com', {
    transports: ['websocket', 'polling']
});

// ==========================================
// 1. EMRI I LOJTARIT
// ==========================================
let myName = sessionStorage.getItem('zion_player_name');

if (!myName) {
    let person = prompt("Ju lutem shkruani emrin tuaj:", "");
    
    if (person == null || person == "") {
        myName = "Lojtar-" + Math.floor(Math.random() * 1000);
    } else {
        myName = person.substring(0, 12);
    }
    sessionStorage.setItem('zion_player_name', myName);
}

socket.on('connect', () => {
    console.log("✅ U lidha si:", myName);
    socket.emit('joinGame', myName);
});

// ==========================================
// 2. VARIABLA GLOBALE
// ==========================================
const handContainer = document.getElementById('player-hand');
const jackpotElement = document.getElementById('jackpot');
const discardPile = document.getElementById('discard-pile');
const btnMbyll = document.getElementById('btn-mbyll');
const statusDrita = document.getElementById('status-drita');
const statusTeksti = document.getElementById('status-teksti');
const deckElement = document.getElementById('deck-zion');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const cardCountSpan = document.getElementById('card-count');
const displayPiketHeader = document.getElementById('display-piket-header');

let gameStarted = false;
let isMyTurn = false;
let doraImeData = [];
let isDraggingCard = false; 
let tookJackpotThisTurn = false;
let placeholder = null;
let allPlayers = [];
let currentRound = 1;
const maxRounds = 10;

// ==========================================
// 3. KONSTANTE DHE FUNKSIONE NDIHMËSE
// ==========================================
const cardValues = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 10, 'Q': 10, 'K': 10, 'A': 10
};

function getVal(card, highAce = false) {
    const v = card.v;
    if (['★', 'Jokeri', 'Xhoker'].includes(v)) return 0;
    if (v === 'A') return highAce ? 14 : 1; 
    if (v === 'J') return 11;
    if (v === 'Q') return 12;
    if (v === 'K') return 13;
    return parseInt(v) || 0;
}

// ==========================================
// 4. PËRDITËSIMI I LOJËS NGA SERVERI
// ==========================================
socket.on('updateGameState', (data) => {
    console.log("📦 Mora statusin e ri:", data);
    
    if (data.players) {
        allPlayers = data.players;
        updatePlayerStatus(data.players, data.activePlayerId);
    }
    
    updateGameFlow(data);
});

// ==========================================
// 5. PËRDITËSO STATUSIN E LOJTARIT
// ==========================================
function updatePlayerStatus(players, activeId) {
    // Përditëso round-in
    document.getElementById('current-round').innerText = currentRound;
    document.getElementById('max-rounds').innerText = maxRounds;
    
    // Kontrollo nëse është radha ime
    isMyTurn = (activeId === socket.id);
    
    // Përditëso status-in
    if (statusTeksti) {
        if (isMyTurn) {
            statusTeksti.innerText = (doraImeData.length === 10) ? "Tërhiq një letër!" : "Hidh një letër!";
            statusDrita.className = doraImeData.length === 10 ? 'led-yellow' : 'led-green';
        } else {
            statusTeksti.innerText = "Pret radhën...";
            statusDrita.className = 'led-red';
        }
    }
}

// ==========================================
// 6. RRJEDHA E LOJËS
// ==========================================
function updateGameFlow(data) {
    if (!data) data = {};

    if (data.activePlayerId) {
        isMyTurn = (data.activePlayerId === socket.id);
    } 

    // Përditëso deck-un
    if (deckElement) {
        const duhetTeTerheq = isMyTurn && doraImeData.length === 10;
        
        if (duhetTeTerheq) {
            deckElement.classList.add('active-deck');
            deckElement.style.pointerEvents = "auto";
            deckElement.style.cursor = "pointer";
        } else {
            deckElement.classList.remove('active-deck');
            deckElement.style.pointerEvents = "none";
            deckElement.style.cursor = "default";
        }
    }

    // Përditëso Jackpot-in
    if (jackpotElement && data.jackpotCard) {
        const jackpotInner = jackpotElement.querySelector('.jackpot-card');
        if (jackpotInner) {
            const isRed = ['♥', '♦'].includes(data.jackpotCard.s);
            jackpotInner.innerHTML = `
                <span class="v">${data.jackpotCard.v}</span>
                <span class="s">${data.jackpotCard.s}</span>
            `;
            jackpotInner.style.color = isRed ? '#e74c3c' : '#2c3e50';
        }
        jackpotElement.style.display = 'flex';
    } else if (jackpotElement) {
        jackpotElement.style.display = 'flex';
    }

    // Përditëso status
    if (statusTeksti) {
        if (isMyTurn) {
            statusTeksti.innerText = (doraImeData.length === 10) ? "Tërhiq një letër!" : "Hidh një letër!";
            statusDrita.className = doraImeData.length === 10 ? 'led-yellow' : 'led-green';
        } else {
            statusTeksti.innerText = "Pret radhën...";
            statusDrita.className = 'led-red';
        }
    }

    if (doraImeData.length > 0) {
        renderHand();
    }
}

// ==========================================
// 7. LETRAT E MIA (yourCards)
// ==========================================
socket.on('yourCards', (cards) => {
    console.log("🃏 Letrat e mia:", cards);
    
    if (cards && Array.isArray(cards)) {
        doraImeData = cards.map((c, i) => ({
            ...c, 
            id: c.id || `${c.v}-${c.s}-${i}-${Date.now()}-${Math.random()}`
        }));
        
        renderHand();
        
        if (cardCountSpan) {
            cardCountSpan.innerText = doraImeData.length;
        }
        
        setTimeout(() => {
            checkZionCondition();
        }, 100);
    }
});

// ==========================================
// 8. RENDER HAND (Vizatimi i letrave)
// ==========================================
let dragElement = null;

function renderHand() {
    if (isDraggingCard) return;

    if (!handContainer) return;

    if (!doraImeData || doraImeData.length === 0) {
        handContainer.innerHTML = "<div style='color: #aaa; padding: 20px;'>Nuk ka letra</div>"; 
        return;
    }

    // Fshi ghost cards
    const ghostCards = document.querySelectorAll('body > .card.dragging');
    ghostCards.forEach(card => card.remove());

    handContainer.innerHTML = '';

    doraImeData.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        
        div.dataset.index = index;
        div.dataset.v = card.v;
        div.dataset.s = card.s;
        div.dataset.id = card.id;

        if (card.v === '★' || card.v === 'Xhoker') {
            div.classList.add('joker');
            div.innerHTML = `★<br><small>JOK</small>`;
        } else {
            div.innerHTML = `${card.v}<br>${card.s}`;
            if (['♥', '♦'].includes(card.s)) {
                div.style.color = 'red';
            }
        }
        
        div.onmousedown = onDragStart;
        div.ontouchstart = (e) => onDragStart(e);

        handContainer.appendChild(div);
    });
    
    // Përditëso numëruesin e letrave
    if (cardCountSpan) {
        cardCountSpan.innerText = doraImeData.length;
    }
    
    // Përditëso pikët
    let piketAktuale = calculateScore(doraImeData);
    if (displayPiketHeader) {
        displayPiketHeader.innerText = `Pikët: ${piketAktuale}`;
    }
    
    checkZionCondition();
}

// ==========================================
// 9. Klikimi në deck
// ==========================================
if (deckElement) {
    deckElement.onclick = () => {
        console.log("🃏 Klikuar mbi dekun...");

        if (isMyTurn && doraImeData.length === 10) {
            socket.emit('drawCard');
            console.log("✅ Kërkesa u dërgua: drawCard");
            deckElement.classList.remove('active-deck');
        } 
        else if (isMyTurn && doraImeData.length === 11) {
            alert("Ti e ke marrë letrën! Tani duhet të hedhësh një në tokë.");
        }
        else if (!isMyTurn) {
            console.warn("⏳ Prit radhën tënde!");
        }
    };
}

// ==========================================
// 10. Marrja e letrës
// ==========================================
socket.on('cardDrawn', (newCard) => {
    console.log("🎴 Letra e re:", newCard);
    
    const exists = doraImeData.some(c => c.id === newCard.id);
    
    if (!exists) {
        doraImeData.push(newCard);
        renderHand();
    }

    setTimeout(() => {
        checkZionCondition();
    }, 700);
});

// ==========================================
// 11. CHECK ZION CONDITION
// ==========================================
function checkZionCondition() {
    if (!btnMbyll) return;

    if (isMyTurn && doraImeData.length === 11) {
        document.body.classList.add('my-turn-glow'); 
        
        let mundTeMbyllet = false;

        for (let i = 0; i < doraImeData.length; i++) {
            let testHand = [...doraImeData];
            let removedCard = testHand.splice(i, 1)[0];

            if (['★', 'Jokeri', 'Xhoker'].includes(removedCard.v)) continue;

            if (isDoraValid(testHand)) {
                mundTeMbyllet = true;
                break; 
            }
        }

        if (mundTeMbyllet) {
            btnMbyll.style.display = 'inline-block';
            btnMbyll.innerHTML = "MBYLL (ZION)";
            
            if (statusDrita) statusDrita.className = 'led-green';
            if (statusTeksti) {
                statusTeksti.innerText = "ZION! Mund të mbyllesh.";
            }
        } else {
            btnMbyll.style.display = 'none';
            if (statusDrita) statusDrita.className = 'led-orange'; 
            if (statusTeksti) statusTeksti.innerText = "Kombino letrat...";
        }

    } else {
        document.body.classList.remove('my-turn-glow'); 
        btnMbyll.style.display = 'none';
    }
}

// ==========================================
// 12. BUTONI MBYLL
// ==========================================
document.getElementById('btn-mbyll')?.addEventListener('click', () => {
    if (!isMyTurn || doraImeData.length !== 11) {
        alert("Nuk mund të mbyllësh!");
        return;
    }

    if (confirm("A dëshiron të mbyllësh lojën (ZION)?")) {
        socket.emit('declareZion', { 
            isJackpotClosing: tookJackpotThisTurn || false 
        });

        btnMbyll.style.display = 'none';
        isMyTurn = false; 
    }
});

// ==========================================
// 13. JACKPOT
// ==========================================
if (jackpotElement) {
    jackpotElement.addEventListener('click', () => {
        if (isMyTurn && doraImeData.length === 10) {
            tookJackpotThisTurn = true; 
            socket.emit('drawJackpot');
            
            jackpotElement.style.transform = "scale(0.9)";
            setTimeout(() => {
                jackpotElement.style.transform = "";
            }, 300);
        } else {
            alert("Jackpot merret vetëm si letra e fundit!");
        }
    });
}

// ==========================================
// 14. FUNKSIONET E VALIDIMIT
// ==========================================
function isDoraValid(cards) {
    if (!cards || cards.length === 0) return true;

    let jokers = cards.filter(c => ['★', 'Jokeri', 'Xhoker'].includes(c.v)).length;
    let normalCards = cards.filter(c => !['★', 'Jokeri', 'Xhoker'].includes(c.v));

    normalCards.sort((a, b) => {
        if (a.s !== b.s) return a.s.localeCompare(b.s);
        return getVal(a, false) - getVal(b, false);
    });

    function solve(remaining, jks) {
        if (remaining.length === 0) return true;

        let first = remaining[0];

        let sameValue = remaining.filter(c => c.v === first.v);
        for (let size of [4, 3]) {
            let maxNormal = Math.min(sameValue.length, size);
            for (let n = maxNormal; n >= 1; n--) {
                let jNeeded = size - n;
                if (jNeeded <= jks) {
                    let nextCards = [...remaining];
                    let removed = 0;
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

        for (let size = 3; size <= 5; size++) {
            let currentJks = jks;
            let tempRemaining = [...remaining];
            let firstVal = getVal(first, false);
            let suit = first.s;
            
            let possible = true;
            tempRemaining.shift();

            for (let i = 1; i < size; i++) {
                let targetVal = firstVal + i;
                
                let idx = tempRemaining.findIndex(c => {
                    let v = getVal(c, targetVal === 14); 
                    return v === targetVal && c.s === suit;
                });

                if (idx !== -1) {
                    tempRemaining.splice(idx, 1);
                } else if (currentJks > 0) {
                    currentJks--;
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

// ==========================================
// 15. HEDHJA E LETRËS
// ==========================================
function processDiscard(cardElement) {
    if (!isMyTurn || doraImeData.length !== 11) {
        isDraggingCard = false;
        renderHand();
        return; 
    }

    const cardId = cardElement.dataset.id; 
    const cardIndex = doraImeData.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
        const letraObjekt = doraImeData[cardIndex]; 

        doraImeData.splice(cardIndex, 1); 

        socket.emit('discardCard', letraObjekt);

        const discardContainer = document.getElementById('discard-cards-container');
        
        // Shto një mini-kartë në zonën e hedhjes
        const miniCard = document.createElement('div');
        miniCard.className = 'card-mini';
        
        if (letraObjekt.v === '★' || letraObjekt.v === 'Xhoker') {
            miniCard.classList.add('joker');
            miniCard.innerHTML = '★';
        } else {
            miniCard.innerHTML = `${letraObjekt.v}${letraObjekt.s}`;
            if (['♥', '♦'].includes(letraObjekt.s)) {
                miniCard.classList.add('red');
            }
        }
        
        if (discardContainer) {
            discardContainer.appendChild(miniCard);
            while (discardContainer.children.length > 5) {
                discardContainer.removeChild(discardContainer.firstChild);
            }
        }

        // Fshi kartën origjinale
        if (cardElement.parentNode) cardElement.remove();
        
        renderHand(); 
        checkZionCondition();

    } else {
        console.error("❌ Letra nuk u gjet!");
        isDraggingCard = false;
        renderHand(); 
    }
}

// ==========================================
// 16. FUNKSIONET E DRAG & DROP
// ==========================================
function onDragStart(e) {
    if (dragElement) return;
    
    // Lejo drag vetëm nëse është radha ime dhe kam 11 letra
    if (!isMyTurn || doraImeData.length !== 11) return;
    
    isDraggingCard = true;
    
    const isTouch = e.type === 'touchstart';
    const t = isTouch ? e.touches[0] : e;
    const div = e.currentTarget;
    const rect = div.getBoundingClientRect();

    div.dataset.offsetX = t.clientX - rect.left;
    div.dataset.offsetY = t.clientY - rect.top;

    dragElement = div;

    placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';

    div.parentNode.insertBefore(placeholder, div);

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
    
    let x = t.clientX - parseFloat(dragElement.dataset.offsetX);
    let y = t.clientY - parseFloat(dragElement.dataset.offsetY);

    dragElement.style.left = x + 'px';
    dragElement.style.top = y + 'px';

    updateZonesFeedback(t.clientX, t.clientY);
}

function updateZonesFeedback(x, y) {
    const pile = document.getElementById('discard-pile');

    if (pile) {
        const r = pile.getBoundingClientRect();
        const over = x > r.left && x < r.right && y > r.top && y < r.bottom;
        pile.classList.toggle('over', over);
    }
}

function onDragEnd(e) {
    if (!dragElement) return;

    const t = e.type.includes('touch') ? 
              (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : e.touches[0]) : 
              e;

    const pile = document.getElementById('discard-pile');
    const handContainer = document.getElementById('player-hand');
    const tolerance = 60; 

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchend', onDragEnd);

    dragElement.style.pointerEvents = 'auto'; 
    dragElement.classList.remove('dragging');

    let isOverPile = false;

    if (pile && t) {
        const r = pile.getBoundingClientRect();
        isOverPile = t.clientX > r.left - tolerance && t.clientX < r.right + tolerance && 
                     t.clientY > r.top - tolerance && t.clientY < r.bottom + tolerance;
    }

    if (isOverPile && isMyTurn && doraImeData.length === 11) {
        if (placeholder) placeholder.remove();
        dragElement.style.position = '';
        processDiscard(dragElement); 
    } else {
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(dragElement, placeholder);
        } else if (dragElement.parentNode !== handContainer) {
            handContainer.appendChild(dragElement);
        }

        if (placeholder) placeholder.remove();

        Object.assign(dragElement.style, {
            position: '', zIndex: '', pointerEvents: 'auto', 
            width: '', height: '', left: '', top: '',
            margin: '', transform: '', transition: 'all 0.2s ease'
        });

        // Përditëso renditjen
        const currentCards = [...handContainer.querySelectorAll('.card')];
        doraImeData = currentCards.map(c => ({
            v: c.dataset.v,
            s: c.dataset.s,
            id: c.dataset.id
        }));
    }
    
    isDraggingCard = false;
    dragElement = null; 
    placeholder = null;
    
    if (pile) pile.classList.remove('over');
}

// ==========================================
// 17. CALCULATE SCORE
// ==========================================
function calculateScore(cards) {
    if (!cards || cards.length === 0) return 0;

    let score = 0;
    cards.forEach(card => {
        if (card.v === '★' || card.v === 'Xhoker') return;
        if (['A', 'K', 'Q', 'J', '10'].includes(card.v)) {
            score += 10;
        } else {
            score += parseInt(card.v) || 0;
        }
    });
    return score;
}

// ==========================================
// 18. CHAT FUNKSIONALITETI
// ==========================================
if (chatSend && chatInput) {
    chatSend.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message) {
            socket.emit('chatMessage', {
                name: myName,
                message: message
            });
            chatInput.value = '';
        }
    });
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            chatSend.click();
        }
    });
}

socket.on('chatMessage', (data) => {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `<span class="chat-username">${data.name}:</span> <span class="chat-text">${data.message}</span>`;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    while (chatMessages.children.length > 20) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
});

// ==========================================
// 19. ROUND OVER
// ==========================================
socket.on('roundOver', (data) => {
    console.log("🏁 Raundi përfundoi!", data);
    
    if (data.updatedPlayers) {
        currentRound++;
        document.getElementById('current-round').innerText = currentRound;
    }
    
    // Fshi letrat
    doraImeData = [];
    renderHand();
    
    // Fshi discard
    const discardContainer = document.getElementById('discard-cards-container');
    if (discardContainer) {
        discardContainer.innerHTML = '';
    }
});

// ==========================================
// 20. SHFAQJA E LETRAVE FITUESE
// ==========================================
socket.on('showWinnerCards', (winnerCards) => {
    const winnerDisplay = document.getElementById('winner-cards-display');
    const winnerContainer = document.getElementById('winner-cards-container');
    
    if (!winnerDisplay || !winnerContainer) return;
    
    winnerContainer.innerHTML = '';
    
    winnerCards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card';
        
        if (card.v === '★' || card.v === 'Xhoker') {
            div.classList.add('joker');
            div.innerHTML = `★<br><small>JOK</small>`;
        } else {
            div.innerHTML = `${card.v}<br>${card.s}`;
            if (['♥', '♦'].includes(card.s)) {
                div.style.color = 'red';
            }
        }
        
        winnerContainer.appendChild(div);
    });
    
    winnerDisplay.style.display = 'flex';
    
    setTimeout(() => {
        winnerDisplay.style.display = 'none';
    }, 5000);
});

// ==========================================
// 21. TOGGLE SCOREBOARD
// ==========================================
window.toggleScoreboard = function() {
    const mainModal = document.getElementById('score-modal');
    
    if (!mainModal) return;

    const isHidden = mainModal.style.display === "none";

    if (isHidden) {
        // Krijo tabelën e rezultateve
        const modalContainer = document.getElementById('modal-score-table-container');
        if (modalContainer && allPlayers.length > 0) {
            let tableHTML = '<table style="width:100%; border-collapse:collapse;">';
            tableHTML += '<thead><tr><th>Lojtari</th><th>Pikët</th><th>Historia</th></tr></thead>';
            tableHTML += '<tbody>';
            
            allPlayers.forEach(player => {
                let history = player.history ? player.history.join(' ') : '-';
                tableHTML += `<tr>
                    <td>${player.name}</td>
                    <td><strong>${player.score}</strong></td>
                    <td>${history}</td>
                </tr>`;
            });
            
            tableHTML += '</tbody></table>';
            modalContainer.innerHTML = tableHTML;
        }
        mainModal.style.display = 'flex';
    } else {
        mainModal.style.display = 'none';
    }
};

// ==========================================
// 22. SORTABLE JS (Drag & Drop)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const handContainer = document.getElementById('player-hand');
    const discardPile = document.getElementById('discard-pile');

    if (handContainer && typeof Sortable !== 'undefined') {
        new Sortable(handContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                if (!isMyTurn || doraImeData.length !== 11) {
                    renderHand(); // Rikthe renditjen origjinale
                    return;
                }
                const cardElements = Array.from(document.querySelectorAll('#player-hand .card'));
                doraImeData = cardElements.map(el => ({
                    v: el.dataset.v,
                    s: el.dataset.s,
                    id: el.dataset.id
                }));
                socket.emit('update_my_hand_order', doraImeData);
            }    
        });
    }
});

// ==========================================
// 23. KONTROLLO BACKGROUND NË LOAD
// ==========================================
window.addEventListener('load', () => {
    console.log("✅ ZION 71 - Mobile version u ngarkua!");
    
    // Nëse nuk ka lidhje me serverin, krijo disa letra demo
    setTimeout(() => {
        if (doraImeData.length === 0) {
            console.log("📦 Duke krijuar letra demo...");
            doraImeData = [
                { v: '7', s: '♥', id: 'demo1' },
                { v: '8', s: '♥', id: 'demo2' },
                { v: '9', s: '♥', id: 'demo3' },
                { v: 'K', s: '♠', id: 'demo4' },
                { v: 'Q', s: '♠', id: 'demo5' },
                { v: '★', s: 'Joker', id: 'demo6' },
                { v: 'A', s: '♣', id: 'demo7' },
                { v: '2', s: '♦', id: 'demo8' },
                { v: '5', s: '♦', id: 'demo9' },
                { v: '10', s: '♠', id: 'demo10' },
                { v: 'J', s: '♣', id: 'demo11' }
            ];
            renderHand();
            isMyTurn = true;
            statusTeksti.innerText = "Hidh një letër!";
            statusDrita.className = 'led-green';
        }
    }, 2000);
});

console.log("✅ ZION 71 - Script u ngarkua me sukses!");
