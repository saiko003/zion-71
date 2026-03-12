// ==========================================
// ZION 71 - SCRIPT I PLOTË I PASTRUAR
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
const lobbyControls = document.getElementById('lobby-controls');
const gameTable = document.getElementById('game-table');
const deckElement = document.getElementById('deck-zion') || document.getElementById('deck');
const playersColumn = document.getElementById('players-column');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const landscapeScoreBody = document.getElementById('landscape-score-body');

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
const cardOrder = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 
    '10': 10, 'J': 11, 'Q': 12, 'K': 13
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
// 4. LOBBY MESSAGES
// ==========================================
socket.on('lobbyMessage', (msg) => {
    const lobbyText = document.getElementById('lobby-text');
    if (lobbyText) lobbyText.innerText = msg;
});

// ==========================================
// 5. FILLIMI I LOJËS
// ==========================================
const btnstart = document.getElementById('btn-start');
if (btnstart) {
    btnstart.onclick = () => {
        console.log("🚀 Po nis lojën...");
        socket.emit('startGame');
    };
}

socket.on('initGame', () => {
    console.log("🎮 Loja nisi! Po fsheh Lobby-n...");
    
    document.body.style.background = "radial-gradient(circle, #1a4a1a 0%, #0d2a0d 100%)";
    
    const lobby = document.getElementById('lobby-controls'); 
    const table = document.getElementById('game-table');

    if (lobby) {
        lobby.style.display = 'none'; 
        lobby.classList.add('hidden');
        console.log("✅ Lobby u fsheh");
    }

    if (table) {
        table.style.display = 'block';
        table.classList.remove('hidden');
        console.log("✅ Table u shfaq");
    }
    
    // Përditëso round-in
    document.getElementById('current-round').innerText = currentRound;
    document.getElementById('max-rounds').innerText = maxRounds;
});

// ==========================================
// 6. PËRDITËSIMI I LOJËS NGA SERVERI
// ==========================================
socket.on('updateGameState', (data) => {
    console.log("📦 Mora statusin e ri:", data);
    
    if (data.players) {
        allPlayers = data.players;
        updatePlayersColumn(data.players, data.activePlayerId);
        updateLandscapeScoreboard(data.players);
        updateScoreboard(data.players, data.activePlayerId);
    }
    
    updateGameFlow(data);
});

// ==========================================
// 7. KOLONA E LOJTARËVE (MAJTAS)
// ==========================================
function updatePlayersColumn(players, activeId) {
    if (!playersColumn) return;
    
    playersColumn.innerHTML = '';
    
    // Filtro vetëm lojtarët aktivë (jo të eliminuar)
    const activePlayers = players.filter(p => !p.isOut);
    
    activePlayers.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        
        if (player.id === socket.id) {
            playerCard.classList.add('you');
        }
        
        if (player.isOut) {
            playerCard.classList.add('eliminated');
        }
        
        const isYourTurn = (player.id === activeId);
        
        let turnIndicator = '';
        if (isYourTurn) {
            turnIndicator = '<div class="player-turn-indicator">RADHA JOTE</div>';
        } else if (!player.isOut) {
            turnIndicator = '<div class="player-waiting-indicator">PRIT RADHËN</div>';
        }
        
        playerCard.innerHTML = `
            ${turnIndicator}
            <div class="player-name">${player.name} ${player.id === socket.id ? '(Ti)' : ''}</div>
            <div class="player-stats">
                <span>🏆 ${player.score}</span>
            </div>
        `;
        
        playersColumn.appendChild(playerCard);
    });
}

// ==========================================
// 8. TABELA E REZULTATIT (NË QENDËR)
// ==========================================
function updateLandscapeScoreboard(players) {
    if (!landscapeScoreBody) return;
    
    landscapeScoreBody.innerHTML = '';
    
    // Filtro lojtarët aktivë
    const activePlayers = players.filter(p => !p.isOut);
    
    activePlayers.forEach(player => {
        const row = document.createElement('tr');
        
        let lastScore = '-';
        if (player.history && player.history.length > 0) {
            const last = player.history[player.history.length - 1];
            if (last === 'X') {
                lastScore = '🏆';
            } else if (typeof last === 'number') {
                lastScore = last > 0 ? `+${last}` : last;
            } else {
                lastScore = last;
            }
        }
        
        row.innerHTML = `
            <td>${player.name}</td>
            <td>${lastScore}</td>
        `;
        
        landscapeScoreBody.appendChild(row);
    });
}

// ==========================================
// 9. TOGGLE SCOREBOARD (MODAL I MADH)
// ==========================================
function toggleScoreboard() {
    console.log("📊 Klikua tabela e rezultatit!"); 

    const mainModal = document.getElementById('score-modal'); 
    const sideTable = document.getElementById('side-score-table');
    const modalContainer = document.getElementById('modal-score-table-container');

    if (!mainModal) {
        console.error("Gabim: Nuk u gjet #score-modal");
        return;
    }

    const isHidden = window.getComputedStyle(mainModal).display === "none";

    if (isHidden) {
        if (sideTable && modalContainer) {
            modalContainer.innerHTML = `
                <table id="modal-table-version" style="width: 100%; border-collapse: collapse;">
                    <thead>${sideTable.querySelector('thead').innerHTML}</thead>
                    <tbody id="modal-table-body-version">${sideTable.querySelector('tbody').innerHTML}</tbody>
                </table>
            `;

            const allCells = modalContainer.querySelectorAll('td, th');
            allCells.forEach(el => {
                el.style.setProperty('display', 'table-cell', 'important');
                el.style.padding = "10px";
                el.style.textAlign = "center";
                el.style.borderBottom = "1px solid #444";
            });
        }

        mainModal.style.setProperty('display', 'flex', 'important');
        console.log("✅ Modali u hap!");
    } else {
        mainModal.style.display = "none";
        console.log("✅ Modali u mbyll!");
    }
}

// ==========================================
// 10. SCOREBOARD I VOGËL (ANASH)
// ==========================================
function updateScoreboard(players, activeId) {
    window.playersData = players;
    const scoreBody = document.getElementById('side-score-body'); 
    const scoreTable = document.getElementById('side-score-table');
    if (!scoreBody || !scoreTable) return;
   
    const scoreHeader = scoreTable.querySelector('thead tr');
    if (!scoreHeader) return;

    let maxRounds = players.reduce((max, p) => {
        const historyLen = (p.history && Array.isArray(p.history)) ? p.history.length : 0;
        return Math.max(max, historyLen);
    }, 0);

    let headerHTML = `<th>Lojtari</th>`;
    for (let i = 1; i <= maxRounds; i++) {
        headerHTML += `<th>R${i}</th>`;
    }
    headerHTML += `<th>Total</th>`;
    scoreHeader.innerHTML = headerHTML;

    scoreBody.innerHTML = '';
    players.forEach(player => {
        const row = document.createElement('tr');

        if (player.id === activeId) row.classList.add('active-row');
        if (player.isOut || player.score >= 71) row.classList.add('eliminated'); 

        let nameCell = `<td>${player.name} ${player.id === socket.id ? '<small>(Ti)</small>' : ''}</td>`;
        
        let historyCells = '';
        for (let i = 0; i < maxRounds; i++) {
            let pikaRaundi = (player.history && player.history[i] !== undefined) ? player.history[i] : '-';
            
            let cellStyle = "";
            if (pikaRaundi === "X") {
                cellStyle = 'class="winner-cell" style="color: #2ecc71; font-weight: bold;"';
            } else if (typeof pikaRaundi === "string" && pikaRaundi.includes("!")) {
                cellStyle = 'class="jackpot-cell" style="color: #e74c3c; font-weight: bold;"';
            }

            historyCells += `<td ${cellStyle}>${pikaRaundi}</td>`;
        }
        
        let totalCell = `<td><strong>${player.score}</strong></td>`;
        
        row.innerHTML = nameCell + historyCells + totalCell;
        row.style.cursor = 'pointer';

        row.onclick = (e) => { 
            console.log("Klikimi u regjistrua për " + player.name);
            if (e) e.stopPropagation();
            toggleScoreboard();
        };

        scoreBody.appendChild(row);
    });
    
    const modalTableBody = document.querySelector('#modal-table-version tbody');
    const modalTableHeader = document.querySelector('#modal-table-version thead tr');

    if (modalTableBody) {
        modalTableBody.innerHTML = scoreBody.innerHTML;
    }
    
    if (modalTableHeader) {
        modalTableHeader.innerHTML = scoreHeader.innerHTML;
    }
}

// ==========================================
// 11. KLIKIMI I TABELËS SË VOGËL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const resultsTable = document.getElementById('results-table-clickable');
    if (resultsTable) {
        resultsTable.addEventListener('click', toggleScoreboard);
    }
});

// ==========================================
// 12. LETRAT E MIA (yourCards)
// ==========================================
socket.on('yourCards', (cards) => {
    console.log("🃏 Letrat e mia:", cards);
    
    if (cards && Array.isArray(cards)) {
        doraImeData = cards.map((c, i) => ({
            ...c, 
            id: c.id || `${c.v}-${c.s}-${i}-${Date.now()}-${Math.random()}`
        }));
        
        renderHand();
        
        setTimeout(() => {
            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
        }, 100);
    }
});

// ==========================================
// 13. Rrjedha e lojës (updateGameFlow)
// ==========================================
function updateGameFlow(data) {
    if (!data) data = {};

    if (data.myCards && Array.isArray(data.myCards)) {
        if (isDraggingCard) return; 
        if (doraImeData.length === data.myCards.length) return;

        if (data.myCards.length > doraImeData.length && doraImeData.length > 0) {
            const letraTeReja = data.myCards.filter(serverCard => 
                !doraImeData.some(localCard => localCard.id === serverCard.id)
            );

            if (letraTeReja.length > 0) {
                console.log("➕ Letra e re u shtua:", letraTeReja);
                doraImeData.push(...letraTeReja);
                renderHand();
                return;
            }
        }

        if (doraImeData.length === 0 || Math.abs(doraImeData.length - data.myCards.length) > 1) {
            doraImeData = data.myCards;
            renderHand();
        }
    }

    if (data.activePlayerId) {
        isMyTurn = (data.activePlayerId === socket.id);
    } 

    if (doraImeData.length === 11) {
        isMyTurn = true;
    }
    
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // Përditëso kolonën e lojtarëve kur ndryshon radha
    if (data.players) {
        updatePlayersColumn(data.players, data.activePlayerId);
    }
    
    // Përditëso deck-un
    const deck = document.getElementById('deck-zion');
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

    // Përditëso Jackpot-in
    const jackpot = document.getElementById('jackpot');
    if (jackpot && data.jackpotCard) {
        const isRed = ['♥', '♦'].includes(data.jackpotCard.s);
        jackpot.innerHTML = `
            <div class="v">${data.jackpotCard.v}</div>
            <div class="s">${data.jackpotCard.s}</div>
        `;
        jackpot.style.color = isRed ? '#e74c3c' : '#2c3e50';
        jackpot.style.display = 'flex';
    } else if (jackpot) {
        jackpot.style.display = 'none';
    }

    // Përditëso status message
    const statusMsg = document.getElementById('status-teksti');
    if (statusMsg) {
        if (isMyTurn) {
            statusMsg.innerText = (doraImeData.length === 10) ? "Tërhiq një letër!" : "Hidh një letër!";
            statusMsg.style.color = "#2ecc71";
        } else {
            statusMsg.innerText = "Pret radhën...";
            statusMsg.style.color = "#bdc3c7";
        }
    }

    if (typeof renderHand === "function" && doraImeData.length > 0) {
        renderHand();
    }
}

// ==========================================
// 14. Klikimi në deck (ZION)
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
// 15. Marrja e letrës (cardDrawn)
// ==========================================
socket.on('cardDrawn', (newCard) => {
    console.log("🎴 Letra e re:", newCard);
    
    const exists = doraImeData.some(c => c.id === newCard.id);
    
    if (!exists) {
        pickCardFromDeck(newCard); 
    }

    setTimeout(() => {
        if (typeof checkZionCondition === "function") {
            checkZionCondition();
        }
    }, 700);
});

// ==========================================
// 16. Animacioni i marrjes së letrës
// ==========================================
function pickCardFromDeck(newCardData) {
    const deckElement = document.getElementById('deck-zion'); 
    const handContainer = document.getElementById('player-hand');
    
    if (!deckElement || !handContainer) {
        doraImeData.push(newCardData);
        renderHand();
        return;
    }

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
        backgroundColor: 'white',
        borderRadius: '5px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(tempCard);

    const handRect = handContainer.getBoundingClientRect();
    const targetLeft = handRect.right - 40; 
    const targetTop = handRect.top;

    requestAnimationFrame(() => {
        tempCard.style.left = targetLeft + 'px';
        tempCard.style.top = targetTop + 'px';
        tempCard.style.transform = 'rotate(15deg) scale(0.8)';
        tempCard.style.opacity = '0.5';
    });

    setTimeout(() => {
        if (tempCard.parentNode) tempCard.remove();
        
        const alreadyExists = doraImeData.some(c => c.id === newCardData.id);
        
        if (!alreadyExists) {
            doraImeData.push(newCardData);
            renderHand();
            
            if (deckElement) {
                deckElement.classList.remove('deck-glow');
                deckElement.classList.remove('active-deck');
            }

            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
        }
    }, 600);
}

// ==========================================
// 17. CHECK ZION CONDITION (Butoni)
// ==========================================
function checkZionCondition() {
    const btnMbyll = document.getElementById('btn-mbyll');
    const statusDrita = document.getElementById('status-drita');
    const statusTeksti = document.getElementById('status-teksti');

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
            btnMbyll.style.background = "#2ecc71";
            btnMbyll.innerHTML = "MBYLL LOJËN (ZION)";
            
            if (statusDrita) statusDrita.className = 'led-green';
            if (statusTeksti) {
                statusTeksti.innerText = tookJackpotThisTurn ? "ZION (X2)! Mbyllu." : "ZION! Mund të mbyllesh.";
            }
        } else {
            btnMbyll.style.display = 'none';
            if (statusDrita) statusDrita.className = 'led-orange'; 
            if (statusTeksti) statusTeksti.innerText = "Rregullo grupet (3 ose 4 letra)...";
        }

    } else {
        document.body.classList.remove('my-turn-glow'); 
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
// 18. BUTONI MBYLL
// ==========================================
document.getElementById('btn-mbyll').addEventListener('click', () => {
    if (!isMyTurn || doraImeData.length !== 11) {
        alert("Nuk mund të mbyllësh! Duhet të kesh 11 letra dhe të jetë radha jote.");
        return;
    }

    if (confirm("A dëshiron të mbyllësh lojën (ZION)?")) {
        socket.emit('declareZion', { 
            isJackpotClosing: tookJackpotThisTurn || false 
        });

        document.getElementById('btn-mbyll').style.display = 'none';
        isMyTurn = false; 
    }
});

// ==========================================
// 19. JACKPOT
// ==========================================
if (jackpotElement) {
    jackpotElement.addEventListener('click', () => {
        if (isMyTurn && doraImeData.length === 10) {
            tookJackpotThisTurn = true; 
            socket.emit('drawJackpot');
            
            jackpotElement.style.transform = "translateY(-50px) scale(1.2)";
            jackpotElement.style.opacity = "0";
            
            setTimeout(() => {
                jackpotElement.style.display = "none";
            }, 300);
        } else {
            alert("Jackpot merret vetëm si letra e fundit për mbyllje!");
        }
    });
}

// ==========================================
// 20. FUNKSIONET E VALIDIMIT
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
// 21. HEDHJA E LETRËS (Discard)
// ==========================================
function processDiscard(cardElement) {
    if (!isMyTurn) return; 
    isMyTurn = false; 

    const cardId = cardElement.dataset.id; 
    const cardIndex = doraImeData.findIndex(c => c.id === cardId);
    
    if (cardIndex !== -1) {
        const letraObjekt = doraImeData[cardIndex]; 

        doraImeData.splice(cardIndex, 1); 

        socket.emit('discardCard', letraObjekt);

        const discardZone = document.getElementById('discard-pile');
        const discardContainer = document.getElementById('discard-cards-container');
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
            cardElement.style.transform = "scale(0.5) rotate(10deg)";
            cardElement.style.opacity = "0";
        });
        
        setTimeout(() => {
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

            if (cardElement.parentNode) cardElement.remove();
            
            renderHand(); 
            
            if (typeof checkZionCondition === "function") {
                checkZionCondition();
            }
        }, 400);

    } else {
        console.error("❌ Letra nuk u gjet! ID:", cardId);
        isMyTurn = true; 
        renderHand(); 
    }
}

// ==========================================
// 22. RENDER HAND (Vizatimi i letrave)
// ==========================================
let dragElement = null;

function renderHand() {
    if (isDraggingCard) return;

    const handContainer = document.getElementById('player-hand');
    if (!handContainer) return;

    if (!doraImeData || doraImeData.length === 0) {
        handContainer.innerHTML = ""; 
        return;
    }

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
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
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
    
    // Përditëso pikët
    if (typeof calculateScore === "function") {
        let piketAktuale = calculateScore(doraImeData);
        const elPiket = document.getElementById('display-piket-header');
        if (elPiket) {
            elPiket.innerText = `Pikët: ${piketAktuale}`;
        }
    }
    
    if (typeof checkZionCondition === "function") {
        checkZionCondition();
    }
}

// ==========================================
// 23. FUNKSIONET E DRAG & DROP
// ==========================================
function onDragStart(e) {
    if (dragElement) return;
    
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
    placeholder.style.visibility = 'hidden';

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

    const isJoker = dragElement.dataset.v === '★' || dragElement.classList.contains('joker');
    
    if (isJoker) {
        const handContainer = document.getElementById('player-hand');
        const handRect = handContainer.getBoundingClientRect();
        const limitTop = handRect.top - 70; 
        if (y < limitTop) y = limitTop;
    }

    dragElement.style.left = x + 'px';
    dragElement.style.top = y + 'px';

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
    finalizeCleanup();
}

function finalizeCleanup() {
    if (dragElement) dragElement.classList.remove('dragging');
    dragElement = null;
    
    const pile = document.getElementById('discard-pile');
    if (pile) pile.classList.remove('over');
}

// ==========================================
// 24. CALCULATE SCORE
// ==========================================
function calculateScore(cards) {
    if (!cards || cards.length === 0) return 0;

    let jokers = cards.filter(c => ['★', 'Jokeri', 'Xhoker'].includes(c.v)).length;
    let normalCards = cards.filter(c => !['★', 'Jokeri', 'Xhoker'].includes(c.v));

    normalCards.sort((a, b) => getVal(a) - getVal(b));

    function solve(remaining, jks) {
        if (remaining.length === 0) return 0;

        let first = remaining[0];
        
        let firstVal = (['A', 'K', 'Q', 'J', '10'].includes(first.v)) ? 10 : (parseInt(first.v) || 0);

        let best = firstVal + solve(remaining.slice(1), jks);

        let sameValue = remaining.filter(c => c.v === first.v);
        for (let size of [3, 4]) {
            for (let n = 1; n <= Math.min(sameValue.length, size); n++) {
                let jNeeded = size - n;
                if (jNeeded <= jks) {
                    let count = 0;
                    let filtered = remaining.filter(c => {
                        if (count < n && c.v === first.v) { count++; return false; }
                        return true;
                    });
                    best = Math.min(best, solve(filtered, jks - jNeeded));
                }
            }
        }

        for (let size of [3, 4, 5]) {
            let currentJks = jks;
            let firstValReal = getVal(first);
            let suit = first.s;
            let tempRemaining = remaining.slice(1);
            let possible = true;

            for (let i = 1; i < size; i++) {
                let target = firstValReal + i;
                let idx = tempRemaining.findIndex(c => getVal(c) === target && c.s === suit);
                if (idx !== -1) {
                    tempRemaining.splice(idx, 1);
                } else if (currentJks > 0) {
                    currentJks--;
                } else {
                    possible = false;
                    break;
                }
            }
            if (possible) {
                best = Math.min(best, solve(tempRemaining, currentJks));
            }
        }

        return best;
    }

    return solve(normalCards, jokers);
}

// ==========================================
// 25. ROUND OVER
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
// 26. SHFAQJA E LETRAVE FITUESE
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
            div.innerHTML = `<span class="joker-star">★</span><br><small>ZION</small>`;
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
// 27. CHAT FUNKSIONALITETI
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
    
    // Mbaj vetëm 20 mesazhet e fundit
    while (chatMessages.children.length > 20) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
});

// ==========================================
// 28. SORTABLE JS (Drag & Drop)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const handContainer = document.getElementById('player-hand');
    const discardPile = document.getElementById('discard-pile');

    if (handContainer) {
        new Sortable(handContainer, {
            group: {
                name: 'zion-game',
                pull: true,
                put: false
            },
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
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

    if (discardPile) {
        new Sortable(discardPile, {
            group: {
                name: 'zion-game',
                pull: false,
                put: true
            },
            onAdd: function (evt) {
                const cardEl = evt.item;
                const cardId = cardEl.dataset.id;
                
                // Gjej letrën në dorë
                const cardIndex = doraImeData.findIndex(c => c.id === cardId);
                if (cardIndex !== -1 && isMyTurn && doraImeData.length === 11) {
                    processDiscard(cardEl);
                } else {
                    // Anulo hedhjen
                    evt.preventDefault();
                }
            }
        });
    }
});

// ==========================================
// 29. KONTROLLO BACKGROUND NË LOAD
// ==========================================
window.addEventListener('load', () => {
    const gameTable = document.getElementById('game-table');
    if (gameTable) {
        gameTable.style.background = "transparent";
    }
});

console.log("✅ ZION 71 - Script u ngarkua me sukses!");
