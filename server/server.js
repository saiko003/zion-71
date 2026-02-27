const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- GLOBALS ---
let players = [];
let currentTurnIndex = 0;
let currentDealerIndex = 0; // Kush shpërndan këtë raund
let roundCount = 0;
let deck = [];
let discardPile = [];
let lastWinnerId = null;
let jackpotCard = null;
let gamePhase = "waiting"; // waiting | playing | roundOver
let hasDrawnThisTurn = false;

const cardValues = { 
    '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, 
    '10':10, 'J':10, 'Q':10, 'K':10, 'A':10, '★':0 
};

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    console.log('Një përdorues u lidh:', socket.id);

    // --- 1. JOIN GAME ---
    socket.on('joinGame', (name) => {
        if (gamePhase !== "waiting") {
            socket.emit('error', 'Loja ka nisur.');
            return;
        }
        const existing = players.find(p => p.id === socket.id);
        if (existing) return;

        players.push({
            id: socket.id,
            name: name?.trim() || `Lojtari ${players.length + 1}`,
            score: 0,
            history: [], // Për të ruajtur pikët R1, R2, R3... dhe "X"
            hand: [],
            eliminated: false
        });
        sendGameState();
    });

    // --- 2. REQUEST MY CARDS ---
    socket.on('requestMyCards', () => {
        const player = players.find(p => p.id === socket.id);
        if (!player) return;
        socket.emit('receiveCards', [...player.hand]);
    });

    // --- KËTU MUND TA SHTOSH ---
    socket.on('submitMyPoints', (data) => {
        console.log(`Lojtari ${socket.id} dërgoi pikët: ${data.points}`);
        // Këtu mund të shtosh logjikë tjetër nëse do
    });
    
    socket.on('forceReset', () => {
        gamePhase = "waiting";
        players.forEach(p => {
            p.score = 0;
            p.history = [];
            p.eliminated = false;
            p.hand = [];
        });
        roundCount = 0;
        currentDealerIndex = 0;
        currentTurnIndex = 0;
        io.emit('updateGameState', { gamePhase: "waiting" });
        console.log("!!! LOJA U RESETUA NGA NJË LOJTAR !!!");
    });
    
    // --- 3. START GAME (Me logjikën e Dealer-it) ---
socket.on('startGame', () => {
    console.log("--- Tentim për Start ---");
    console.log("Faza aktuale:", gamePhase);
    console.log("Lojtarë gjithsej:", players.length);

    // 1. Kontrolli i fazës
    if (gamePhase !== "waiting" && gamePhase !== "roundOver") {
        console.log("START u refuzua: Loja është në zhvillim (playing)");
        return;
    }

    // 2. Kontrolli i lojtarëve aktivë
    const activePlayers = players.filter(p => !p.eliminated);
    console.log("Lojtarë aktivë:", activePlayers.length);

    if (activePlayers.length < 2) {
        socket.emit('error', 'Duhen të paktën 2 lojtarë aktivë.');
        return;
    }

    // 3. Inicializimi i raundit
    gamePhase = "playing";
    roundCount++;
    deck = createFullDeck();
    discardPile = [];
    
    // Gjejmë Dealer-in e radhës
    if (roundCount > 1) {
        let attempts = 0;
        do {
            currentDealerIndex = (currentDealerIndex + 1) % players.length;
            attempts++;
        } while (players[currentDealerIndex].eliminated && attempts < players.length);
    }

    currentTurnIndex = currentDealerIndex;

    // 4. Shpërndarja e letrave
    players.forEach((p, i) => {
        if (!p.eliminated) {
            // Dealer-i (currentDealerIndex) merr 10 letra + 1 Xhoker = 11
            // Të tjerët marrin 9 letra + 1 Xhoker = 10
            let count = (i === currentDealerIndex) ? 10 : 9;
            p.hand = deck.splice(0, count);
            p.hand.push({ v: '★', s: 'X' }); // Xhoker i detyrueshëm
            
            io.to(p.id).emit('receiveCards', p.hand);
        } else {
            p.hand = [];
        }
    });

    // 5. Letra Jackpot
    jackpotCard = deck.pop() || null;
    
    // ME RËNDËSI: Nëse unë jam Dealer, unë e kam radhën dhe kam 11 letra, 
    // prandaj hasDrawnThisTurn duhet të jetë true që të mund të hedh letër.
    hasDrawnThisTurn = true; 

    console.log(`Raundi ${roundCount} nisi. Dealer: ${players[currentDealerIndex].name}`);
    
    sendGameState();
});
    // --- 4. DRAW CARD ---
    socket.on('drawCard', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (hasDrawnThisTurn) return;
        if (deck.length === 0) {
            // Logjika nëse mbaron deku (Riorganizimi i discardPile)
            if (discardPile.length > 1) {
                const topCard = discardPile.pop();
                deck = discardPile.sort(() => Math.random() - 0.5);
                discardPile = [topCard];
            } else return;
        }

        const card = deck.pop();
        player.hand.push(card);
        hasDrawnThisTurn = true;
        io.to(socket.id).emit('cardDrawn', card);
        sendGameState();
    });

    // --- 5. DRAW JACKPOT ---
    socket.on('drawJackpot', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (hasDrawnThisTurn) return;
        if (!jackpotCard) return;

        player.hand.push(jackpotCard);
        jackpotCard = null;
        hasDrawnThisTurn = true;
        io.to(socket.id).emit('jackpotDrawn');
        sendGameState();
    });

    // --- 6. CARD DISCARDED (Me bllokim Xhokeri) ---
    socket.on('cardDiscarded', (card) => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (!hasDrawnThisTurn) return;

        // RREGULLI: Xhokeri nuk hidhet në tokë!
        if (card.v === '★') {
            socket.emit('error', 'Nuk mund ta hedhësh Xhokerin!');
            return;
        }

        const index = player.hand.findIndex(c => c.v === card.v && c.s === card.s);
        if (index === -1) return;

        const removed = player.hand.splice(index, 1)[0];
        discardPile.push(removed);
        hasDrawnThisTurn = false;

        socket.emit('receiveCards', player.hand);
        moveToNextPlayer(); // Pas hedhjes radha kalon automatikisht
        sendGameState();
    });

    // --- 7. PLAYER CLOSED (Llogaritja me X) ---
    socket.on('playerClosed', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;

        // Verifikimi i dorës (Funksioni yt origjinal)
        if (!verifyHandOnServer(player.hand)) {
            socket.emit('error', 'Dora nuk është valid për mbyllje.');
            return;
        }

        gamePhase = "roundOver";
        lastWinnerId = socket.id;

        // Shpërndajmë pikët për të gjithë
        players.forEach(p => {
            if (p.eliminated) return;
            if (p.id === socket.id) {
                p.history.push("X"); // Fituesi merr X
            } else {
                let roundPoints = p.hand.reduce((total, c) => total + (cardValues[c.v] || 0), 0);
                p.score += roundPoints;
                p.history.push(roundPoints);
                if (p.score > 71) p.eliminated = true;
            }
        });

        io.emit('roundOver', {
            winnerName: player.name,
            winnerId: socket.id,
            players: players,
            roundCount: roundCount
        });
    });

    // --- 8. DISCONNECT ---
    socket.on('disconnect', () => {
        const wasActive = players[currentTurnIndex]?.id === socket.id;
        players = players.filter(p => p.id !== socket.id);
        if (players.length === 0) {
            gamePhase = "waiting";
            currentTurnIndex = 0;
            currentDealerIndex = 0;
            roundCount = 0;
        } else if (wasActive) {
            hasDrawnThisTurn = false;
            moveToNextPlayer();
        }
        sendGameState();
    });

    // --- HELPERS ---
    function moveToNextPlayer() {
        if (players.length === 0) return;
        let attempts = 0;
        do {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            attempts++;
        } while (players[currentTurnIndex]?.eliminated && attempts < players.length);
    }

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({
                name: p.name,
                id: p.id,
                score: p.score,
                eliminated: p.eliminated,
                history: p.history
            })),
            activePlayerId: players[currentTurnIndex]?.id,
            currentDealerId: players[currentDealerIndex]?.id,
            deckCount: deck.length,
            jackpotCard: jackpotCard,
            discardPileTop: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null,
            gamePhase: gamePhase
        });
    }
});

// --- VERIFY HAND (Logjika jote origjinale e paprekur) ---
function verifyHandOnServer(cards) {
    if (!cards || (cards.length !== 10 && cards.length !== 11)) return false;
    const valMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    
    function check10(hand10) {
        let jokers = hand10.filter(c => c.v === '★').length;
        let normalCards = hand10.filter(c => c.v !== '★').map(c => ({ v: valMap[c.v], s: c.s })).sort((a,b)=>a.v-b.v);
        
        function solve(remaining, jLeft) {
            if (remaining.length === 0) return true;
            let first = remaining[0];
            // Same value sets (3-4 cards)
            for (let size = 3; size <= 4; size++) {
                let sameVal = remaining.filter(c => c.v === first.v);
                for (let use = 1; use <= Math.min(sameVal.length, size); use++) {
                    let jNeeded = size - use;
                    if (jNeeded <= jLeft) {
                        let next = [...remaining];
                        for (let i = 0; i < use; i++) {
                            let idx = next.findIndex(c => c.v === first.v);
                            next.splice(idx, 1);
                        }
                        if (solve(next, jLeft - jNeeded)) return true;
                    }
                }
            }
            // Sequences (3-10 cards)
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

    for (let i = 0; i < cards.length; i++) {
        let test = cards.filter((_, idx) => idx !== i);
        if (check10(test)) return true;
    }
    return false;
}

function createFullDeck() {
    let d = [];
    const s = ['♠','♣','♥','♦'], v = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for (let i = 0; i < 2; i++) {
        s.forEach(sym => v.forEach(val => d.push({ v: val, s: sym })));
    }
    return d.sort(() => Math.random() - 0.5);
}

server.listen(process.env.PORT || 10000, () => {
    console.log("Serveri i ZION 71 po punon në portin 10000");
});
