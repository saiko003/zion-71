PO! TANI BĒJMĒ SERVER.JS TĒ PLOTĒ DHE TĒ SINKRONIZUAR! 🚀

```javascript
// ==========================================
// ZION 71 - SERVER I PLOTĒ
// ==========================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Rruga për client
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ==========================================
// 1. VARIABLAT GLOBALE TĒ LOJĒS
// ==========================================
let players = [];
let gameStarted = false;
let gameDeck = [];
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let activePlayerId = null;
let dealerIndex = 0;
let currentRound = 1;
const MAX_ROUNDS = 10;
const WIN_SCORE = 71;

// Vlerat e letrave
const cardValues = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// ==========================================
// 2. FUNKSIONI PËR KRIJIMIN E DEKUT
// ==========================================
function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let newDeck = [];
    let idCounter = 1;

    // 104 letra (2 pako)
    for (let p = 0; p < 2; p++) {
        for (let s of suits) {
            for (let v of values) {
                newDeck.push({ 
                    v: v, 
                    s: s, 
                    id: `c-${idCounter++}`
                });
            }
        }
    }

    // 2 Xhokerë
    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });
    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });

    // Përzierja
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }

    console.log(`🃏 Deku u krijua me ${newDeck.length} letra`);
    return newDeck;
}

// ==========================================
// 3. FUNKSIONET PËR VIERAT E LETRAVE
// ==========================================
function getCardValue(card, highAce = false) {
    if (!card || !card.v) return 0;
    if (card.v === '★') return 0;
    if (card.v === 'A') return highAce ? 14 : 1;
    return cardValues[card.v] || 0;
}

function calculateScore(cards) {
    if (!cards || cards.length === 0) return 0;

    let jokers = cards.filter(c => c.v === '★').length;
    let normalCards = cards.filter(c => c.v !== '★');

    normalCards.sort((a, b) => getCardValue(a) - getCardValue(b));

    function solve(remaining, jks) {
        if (remaining.length === 0) return 0;

        let first = remaining[0];
        let firstVal = (['A', 'K', 'Q', 'J', '10'].includes(first.v)) ? 10 : (parseInt(first.v) || 0);
        let best = firstVal + solve(remaining.slice(1), jks);

        // Provo grupe
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

        // Provo vargje
        for (let size of [3, 4, 5]) {
            let currentJks = jks;
            let firstValReal = getCardValue(first);
            let suit = first.s;
            let tempRemaining = remaining.slice(1);
            let possible = true;

            for (let i = 1; i < size; i++) {
                let target = firstValReal + i;
                let idx = tempRemaining.findIndex(c => getCardValue(c) === target && c.s === suit);
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

function isDoraValid(cards) {
    if (!cards || cards.length === 0) return true;

    let jokers = cards.filter(c => c.v === '★').length;
    let normalCards = cards.filter(c => c.v !== '★');

    normalCards.sort((a, b) => {
        if (a.s !== b.s) return a.s.localeCompare(b.s);
        return getCardValue(a, false) - getCardValue(b, false);
    });

    function solve(remaining, jks) {
        if (remaining.length === 0) return true;

        let first = remaining[0];

        // Provo grupe
        let sameValue = remaining.filter(c => c.v === first.v);
        for (let size of [4, 3]) {
            if (sameValue.length >= size - jks) {
                let maxNormal = Math.min(sameValue.length, size);
                for (let n = maxNormal; n >= 1; n--) {
                    let jNeeded = size - n;
                    if (jNeeded <= jks) {
                        let nextCards = [...remaining];
                        let count = 0;
                        for (let i = 0; i < nextCards.length; i++) {
                            if (count < n && nextCards[i].v === first.v) {
                                nextCards.splice(i, 1);
                                i--; count++;
                            }
                        }
                        if (solve(nextCards, jks - jNeeded)) return true;
                    }
                }
            }
        }

        // Provo vargje
        for (let size = 3; size <= 5; size++) {
            let currentJks = jks;
            let tempRemaining = [...remaining];
            let firstVal = getCardValue(first, false);
            let suit = first.s;
            let possible = true;
            tempRemaining.shift();

            for (let i = 1; i < size; i++) {
                let targetVal = firstVal + i;
                let idx = tempRemaining.findIndex(c => {
                    let v = getCardValue(c, targetVal === 14);
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
// 4. FUNKSIONI PËR TË FILLUAR RAUNDIN E RI
// ==========================================
function startNewRound() {
    console.log(`\n🎮 ===== RAUNDI ${currentRound} FILLOI =====`);

    // Krijo dek të ri
    gameDeck = createDeck();
    discardPile = [];
    
    // Filtro lojtarët aktivë
    const activePlayers = players.filter(p => !p.isOut);
    
    if (activePlayers.length === 0) {
        console.log("🏆 Nuk ka lojtarë aktivë!");
        return;
    }

    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        console.log(`🏆 FITUESI I LOJËS: ${winner.name}`);
        io.emit('gameOver', { winner: winner.name });
        gameStarted = false;
        return;
    }

    // Sigurohu që dealerIndex është te një lojtar aktiv
    while (players[dealerIndex]?.isOut) {
        dealerIndex = (dealerIndex + 1) % players.length;
    }

    // Shpërndaj letrat
    players.forEach((player, index) => {
        if (player.isOut) {
            player.cards = [];
            return;
        }

        player.cards = [];

        // Xhokeri për secilin lojtar
        const joker = { 
            v: '★', 
            s: 'Joker', 
            id: `joker-${player.id}-${Date.now()}`
        };

        // Dealer merr 10 letra, të tjerët 9
        let cardsFromDeck = (index === dealerIndex) ? 10 : 9;
        let drawnCards = gameDeck.splice(0, cardsFromDeck);
        
        player.cards = [joker, ...drawnCards];
        console.log(`📦 ${player.name} mori ${player.cards.length} letra`);
    });

    // Jackpot (letra e parë e stivës)
    jackpotCard = gameDeck.pop() || null;
    if (jackpotCard) {
        console.log(`💰 Jackpot: ${jackpotCard.v}${jackpotCard.s}`);
    }

    // Përcakto lojtarin e parë (ai me 11 letra - dealer)
    const dealer = players[dealerIndex];
    activePlayerIndex = dealerIndex;
    activePlayerId = dealer.id;
    
    console.log(`👉 Lojtari i parë: ${dealer.name}`);

    // Dërgo letrat private
    players.forEach(p => {
        if (!p.isOut) {
            io.to(p.id).emit('yourCards', p.cards);
        }
    });

    // Njofto të gjithë për gjendjen
    broadcastState();
}

// ==========================================
// 5. FUNKSIONI PËR TRANSMETIMIN E GJENDJES
// ==========================================
function broadcastState(shouldSendCards = false) {
    if (players.length === 0) return;

    activePlayerId = players[activePlayerIndex]?.id || null;

    // Mesazhi për lobby
    const activeCount = players.filter(p => !p.isOut).length;
    let lobbyMsg = `ZION 71 - ${activeCount} lojtarë aktivë`;
    
    io.emit('lobbyMessage', lobbyMsg);

    // Dërgo gjendjen
    io.emit('updateGameState', {
        gameStarted: gameStarted,
        players: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history || [],
            cardCount: p.cards ? p.cards.length : 0,
            isOut: p.isOut || false
        })),
        activePlayerId: activePlayerId,
        discardPile: discardPile,
        jackpotCard: jackpotCard,
        currentRound: currentRound,
        maxRounds: MAX_ROUNDS
    });

    if (shouldSendCards) {
        players.forEach(p => {
            if (p.id && p.cards) {
                io.to(p.id).emit('yourCards', p.cards);
            }
        });
    }
}

// ==========================================
// 6. LIDHJA E LOJTARËVE (SOCKET.IO)
// ==========================================
io.on('connection', (socket) => {
    console.log(`🔌 Lojtar i ri u lidh: ${socket.id}`);

    // ======================================
    // 6.1 BASHKOHU NË LOBBY
    // ======================================
    socket.on('joinGame', (playerName) => {
        if (gameStarted) {
            socket.emit('errorMsg', 'Loja ka filluar, nuk mund të hysh tani!');
            return;
        }

        if (players.length >= 5) {
            socket.emit('errorMsg', 'Dhoma është e plotë (maksimumi 5 lojtarë)!');
            return;
        }

        const newPlayer = {
            id: socket.id,
            name: playerName || `Lojtar-${Math.floor(Math.random() * 1000)}`,
            cards: [],
            score: 0,
            history: [],
            isOut: false
        };

        players.push(newPlayer);
        console.log(`✅ ${newPlayer.name} u bashkua. Gjithsej: ${players.length} lojtarë`);

        io.emit('updateLobbyCount', players.length);
        broadcastState();
    });

    // ======================================
    // 6.2 FILLO LOJËN
    // ======================================
    socket.on('startGame', () => {
        console.log("🚀 Kërkesë për të filluar lojën");

        const activePlayers = players.filter(p => !p.isOut);
        
        if (activePlayers.length < 2) {
            socket.emit('errorMsg', 'Duhen të paktën 2 lojtarë për të filluar!');
            return;
        }

        if (gameStarted) {
            socket.emit('errorMsg', 'Loja tashmë ka filluar!');
            return;
        }

        gameStarted = true;
        currentRound = 1;
        
        // Reset lojtarët
        players.forEach(p => {
            p.score = 0;
            p.history = [];
            p.isOut = false;
        });

        console.log("🎮 Loja filloi!");
        
        startNewRound();
        io.emit('initGame');
    });

    // ======================================
    // 6.3 TËRHEQ LETËR
    // ======================================
    socket.on('drawCard', () => {
        const player = players[activePlayerIndex];
        
        if (!player || player.id !== socket.id) return;
        if (player.cards.length !== 10) return;

        if (gameDeck && gameDeck.length > 0) {
            const drawnCard = gameDeck.pop();
            player.cards.push(drawnCard);
            console.log(`🃏 ${player.name} tërhoqi ${drawnCard.v}${drawnCard.s}`);

            socket.emit('cardDrawn', drawnCard);
            broadcastState();
        } else {
            // Nëse deku mbaron, përdor letrat e hedhura
            if (discardPile.length > 1) {
                const lastCard = discardPile.pop();
                gameDeck = [...discardPile];
                discardPile = [lastCard];
                
                for (let i = gameDeck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [gameDeck[i], gameDeck[j]] = [gameDeck[j], gameDeck[i]];
                }
                
                const drawnCard = gameDeck.pop();
                player.cards.push(drawnCard);
                socket.emit('cardDrawn', drawnCard);
                broadcastState();
            } else {
                socket.emit('errorMsg', "Nuk ka më letra!");
            }
        }
    });

    // ======================================
    // 6.4 TËRHEQ JACKPOT
    // ======================================
    socket.on('drawJackpot', () => {
        const player = players[activePlayerIndex];

        if (!player || player.id !== socket.id || player.cards.length !== 10) {
            socket.emit('errorMsg', "Jackpot merret vetëm si letra e 10-të!");
            return;
        }

        if (!jackpotCard) {
            socket.emit('errorMsg', "Jackpot-i është marrë tashmë!");
            return;
        }

        console.log(`💰 ${player.name} mori Jackpot: ${jackpotCard.v}${jackpotCard.s}`);

        const drawnJackpot = jackpotCard;
        player.cards.push(drawnJackpot);
        jackpotCard = null;

        socket.emit('cardDrawn', drawnJackpot);
        broadcastState();
    });

    // ======================================
    // 6.5 HEDH LETËR
    // ======================================
    socket.on('discardCard', (card) => {
        const currentIndex = players.findIndex(p => p.id === socket.id);
        const player = players[currentIndex];

        if (!player || socket.id !== activePlayerId) return;
        if (player.cards.length !== 11) return;

        // Ndalon hedhjen e Xhokerit
        if (card.v === '★') {
            socket.emit('errorMsg', "Xhokeri nuk mund të hidhet!");
            return;
        }

        const cardIndex = player.cards.findIndex(c => 
            c.id === card.id || (c.v === card.v && c.s === card.s)
        );
        
        if (cardIndex !== -1) {
            const removedCard = player.cards.splice(cardIndex, 1)[0];
            discardPile.push(removedCard);
            
            console.log(`🗑️ ${player.name} hodhi ${removedCard.v}${removedCard.s}`);

            // Gjej lojtarin tjetër aktiv
            let foundNext = false;
            for (let i = 1; i < players.length; i++) {
                let checkIdx = (currentIndex + i) % players.length;
                if (!players[checkIdx].isOut) {
                    activePlayerIndex = checkIdx;
                    activePlayerId = players[activePlayerIndex].id;
                    foundNext = true;
                    break;
                }
            }
            
            if (!foundNext) {
                activePlayerId = player.id;
            }

            console.log(`👉 Radha kaloi te: ${players[activePlayerIndex].name}`);
            broadcastState();
        }
    });

    // ======================================
    // 6.6 DEKLARO ZION (MBYLL)
    // ======================================
    socket.on('declareZion', (data) => {
        const winner = players.find(p => p.id === socket.id);
        
        if (!winner || winner.id !== activePlayerId || winner.cards.length !== 11) {
            socket.emit('errorMsg', "Nuk mund të mbyllësh tani!");
            return;
        }

        let isHandValid = false;
        let closingCard = null;

        // Provo të gjitha letrat si mbyllëse
        for (let i = 0; i < winner.cards.length; i++) {
            const testHand = [...winner.cards];
            const removed = testHand.splice(i, 1)[0];

            if (removed.v === '★') continue;

            if (isDoraValid(testHand)) {
                isHandValid = true;
                closingCard = removed;
                winner.cards.splice(i, 1);
                break;
            }
        }

        if (!isHandValid) {
            socket.emit('errorMsg', "Kombinim i pavlefshëm!");
            return;
        }

        if (closingCard) discardPile.push(closingCard);

        const isJackpotWin = data.isJackpotClosing || false;
        console.log(`🏆 ZION! ${winner.name} fiton raundin! ${isJackpotWin ? '(JACKPOT x2)' : ''}`);

        // Llogarit pikët
        players.forEach(p => {
            if (p.isOut) return;
            
            if (p.id !== winner.id) {
                let roundPoints = calculateScore(p.cards);
                if (isJackpotWin) roundPoints *= 2;
                
                p.score += roundPoints;
                if (!p.history) p.history = [];
                p.history.push(isJackpotWin ? `${roundPoints}!` : roundPoints);
                
                if (p.score >= WIN_SCORE) {
                    p.isOut = true;
                    console.log(`💀 ${p.name} u eliminua!`);
                }
            } else {
                if (!p.history) p.history = [];
                p.history.push("X");
            }
        });

        // Dërgo letrat e fituesit për t'i parë të gjithë
        io.emit('showWinnerCards', winner.cards);

        // Njofto përfundimin e raundit
        io.emit('roundOver', {
            winnerName: winner.name,
            winnerId: winner.id,
            isJackpot: isJackpotWin,
            updatedPlayers: players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                history: p.history,
                isOut: p.isOut
            }))
        });

        // Përgatit raundin e ri
        currentRound++;
        
        // Gjej dealer-in e ri
        dealerIndex = (dealerIndex + 1) % players.length;
        while(players[dealerIndex]?.isOut) {
            dealerIndex = (dealerIndex + 1) % players.length;
        }

        discardPile = [];
        jackpotCard = null;

        // Kontrollo nëse loja ka mbaruar
        const activePlayers = players.filter(p => !p.isOut);
        if (activePlayers.length <= 1) {
            const finalWinner = activePlayers.length === 1 ? activePlayers[0].name : "Askush";
            console.log(`🏆🏆🏆 FITUESI I LOJËS: ${finalWinner} 🏆🏆🏆`);
            io.emit('gameOver', { winner: finalWinner });
            gameStarted = false;
        } else {
            setTimeout(() => {
                startNewRound();
            }, 6000);
        }
    });

    // ======================================
    // 6.7 MESAZHE CHAT
    // ======================================
    socket.on('chatMessage', (data) => {
        io.emit('chatMessage', {
            name: data.name,
            message: data.message
        });
    });

    // ======================================
    // 6.8 PËRDITËSO RENDITJEN E LETRAVE
    // ======================================
    socket.on('update_my_hand_order', (newOrder) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.cards = newOrder;
        }
    });

    // ======================================
    // 6.9 KËRKO LETRAT E FITUESIT
    // ======================================
    socket.on('requestWinnerCards', (winnerId) => {
        const winner = players.find(p => p.id === winnerId);
        if (winner) {
            socket.emit('showWinnerCards', winner.cards);
        }
    });

    // ======================================
    // 6.10 LOJTARI SHKËPUTET
    // ======================================
    socket.on('disconnect', () => {
        console.log(`❌ Lojtari u shkëput: ${socket.id}`);
        
        const playerIndex = players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const playerName = players[playerIndex].name;
            players.splice(playerIndex, 1);
            console.log(`👋 ${playerName} u largua nga loja`);
        }
        
        if (players.length === 0) {
            gameStarted = false;
            activePlayerId = null;
            discardPile = [];
            jackpotCard = null;
            console.log("🔄 Dhoma është bosh");
        }

        io.emit('updateLobbyCount', players.length);
        broadcastState();
    });
});

// ==========================================
// 7. FUNKSIONI PËR PËRZIERJE
// ==========================================
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==========================================
// 8. NIS SERVERIN
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 ========================`);
    console.log(`✅ ZION 71 SERVERI U NIS!`);
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🎮 Lojtarët: ${players.length}`);
    console.log(`===========================\n`);
});
```

✅ KJO SERVER.JS PËRFSHIN:

Feature Statusi
Krijimi i dekut me 104 letra + 2 Xhokerë ✅
Shpërndarja e letrave (dealer 10, të tjerët 9) ✅
Jackpot-i ✅
Llogaritja e pikëve ✅
Validimi i kombinimeve ✅
Mbyllja me ZION ✅
Eliminimi në 71 pikë ✅
Chat-i ✅
Round aktual ✅
Përzierja e letrave kur mbaron deku ✅

KOPJOJE DHE ZËVENDËSO SERVER.JS-NË TËNDE! 🚀