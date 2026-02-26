const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = []; 
let currentTurnIndex = 0;
let deck = [];
let discardPile = []; 
let lastWinnerId = null;
let jackpotCard = null; 

io.on('connection', (socket) => {
    console.log('Një përdorues u lidh:', socket.id);

    // --- 1. HYRJA NË LOJË ---
    socket.on('joinGame', (name) => {
        const existing = players.find(p => p.id === socket.id);
        if (!existing) {
            players.push({
                id: socket.id,
                name: name || `Lojtari ${players.length + 1}`,
                score: 0,
                hand: [],
                eliminated: false
            });
            console.log("Lojtari u shtua:", name);
        }
        sendGameState(); 
    });

    // --- 2. KERKIMI I LETRAVE ---
    socket.on('requestMyCards', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            socket.emit('receiveCards', player.hand);
        }
    });

    // --- 3. NISJA E LOJËS ---
    socket.on('startGame', () => {
        const activePlayers = players.filter(p => !p.eliminated);
        if (activePlayers.length < 2) {
            console.log("Nuk mund të nisë: Duhen të paktën 2 lojtarë aktivë.");
            return; 
        }

        deck = createFullDeck();
        discardPile = [];
        
        let startIndex = 0;
        if (lastWinnerId) {
            let winIdx = players.findIndex(p => p.id === lastWinnerId);
            startIndex = (winIdx !== -1) ? (winIdx + 1) % players.length : 0;
        }

        currentTurnIndex = startIndex;
        let safety = 0;
        while (players[currentTurnIndex].eliminated && safety < players.length) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            safety++;
        }

        players.forEach((p, i) => {
            if (!p.eliminated) {
                let count = (i === currentTurnIndex) ? 10 : 9;
                p.hand = deck.splice(0, count);
                p.hand.push({ v: '★', s: 'X' }); 
                io.to(p.id).emit('receiveCards', p.hand);
            }
        });

        if (deck.length > 0) {
            jackpotCard = deck.pop(); 
        }

        console.log("Loja nisi! Radhën e ka:", players[currentTurnIndex].name);
        sendGameState();
    });

    // --- 4. TERHEQJA E LETRES (DECK) ---
    socket.on('drawCard', () => {
        const player = players[currentTurnIndex];
        if (player?.id === socket.id) {
            if (deck.length > 0) {
                const card = deck.pop();
                player.hand.push(card);
                io.to(socket.id).emit('cardDrawn', card);
                sendGameState(); 
            }
        }
    });

    // --- 5. TERHEQJA E JACKPOT-IT ---
    socket.on('drawJackpot', () => {
        const player = players[currentTurnIndex];
        if (player?.id === socket.id && jackpotCard) {
            const card = jackpotCard;
            player.hand.push(card); 
            jackpotCard = null; 
            io.to(socket.id).emit('jackpotDrawn', card);
            sendGameState();
        }
    });

    // --- 6. HEDHJA E LETRES (DISCARD) ---
socket.on('cardDiscarded', (card) => {
    const player = players.find(p => p.id === socket.id);
    if (player) {
        // 1. E fshijmë letrën nga dora në server
        player.hand = player.hand.filter(c => !(c.v === card.v && c.s === card.s));
        
        // 2. E shtojmë te grumbulli i letrave të hedhura
        discardPile.push(card);
        
        // 3. I dërgojmë lojtarit dorën e tij të përditësuar (Që të zhduket letra nga ekrani i tij)
        socket.emit('receiveCards', player.hand); 
        
        // 4. Njoftojmë të gjithë të tjerët që letra e fundit në tavolinë ndryshoi
        sendGameState();
    }
});

    // --- 7. FUNDI I RADHËS ---
    socket.on('endTurn', () => {
        moveToNextPlayer();
        sendGameState();
    });

    // --- 8. MBYLLJA E LOJËS (PLAYER CLOSED) ---
    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        if (winner && verifyHandOnServer(data.hand)) {
            lastWinnerId = socket.id;
            io.emit('roundOver', { 
                winnerName: winner.name, 
                winnerId: socket.id,
                isFlush: data.isFlush,
                winningHand: data.hand 
            });
            console.log(`Lojtari ${winner.name} mbylli lojën!`);
        } else {
            console.log(`Tentativë e pasaktë mbylljeje nga: ${socket.id}`);
            socket.emit('error', 'Dora juaj nuk është e vlefshme për mbyllje!');
        }
    });

    // --- 9. DOREZIMI I PIKËVE ---
    socket.on('submitMyPoints', (data) => {
        const p = players.find(player => player.id === socket.id);
        if (p) {
            let finalPoints = data.isFlush ? data.points * 2 : data.points;
            p.score += finalPoints;
            if (p.score > 71) {
                p.eliminated = true;
            }
        }
        sendGameState();
    });

    // --- 10. CHAT-I ---
    socket.on('sendMessage', (data) => {
        io.emit('receiveMessage', {
            name: data.name,
            message: data.message
        });
    });

    // --- 11. SHKËPUTJA (DISCONNECT) ---
    socket.on('disconnect', () => {
        console.log('Lojtari u shkëput:', socket.id);
        const wasActivePlayer = players[currentTurnIndex]?.id === socket.id;
        players = players.filter(p => p.id !== socket.id);
        
        if (wasActivePlayer || currentTurnIndex >= players.length) {
            moveToNextPlayer(); 
        }
        sendGameState();
    });

    // --- FUNKSIONET NDIHMËSE (Brenda lidhjes) ---

    function moveToNextPlayer() {
        if (players.length === 0) return;
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        let attempts = 0;
        while (players[currentTurnIndex] && players[currentTurnIndex].eliminated && attempts < players.length) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            attempts++;
        }
    }

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({ 
                name: p.name, 
                id: p.id, 
                score: p.score, 
                eliminated: p.eliminated 
            })),
            activePlayerId: players[currentTurnIndex]?.id,
            deckCount: deck.length,
            jackpotCard: jackpotCard,
            discardPileTop: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null
        });
    }

}); // <--- FUNDI I io.on('connection')

// --- LOGJIKA E VERIFIKIMIT (Jashtë lidhjes) ---

function verifyHandOnServer(cards) {
    if (!cards || (cards.length !== 10 && cards.length !== 11)) return false;
    const valMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    
    function check10(hand10) {
        let jokers = hand10.filter(c => c.v === '★').length;
        let normalCards = hand10.filter(c => c.v !== '★').map(c => ({ v: valMap[c.v], s: c.s })).sort((a, b) => a.v - b.v);
        
        function solve(remaining, jLeft) {
            if (remaining.length === 0) return true;
            let first = remaining[0];
            
            // Kontrollo grupet me vlerë të njëjtë
            for (let size = 3; size <= 4; size++) {
                let sameVal = remaining.filter(c => c.v === first.v);
                for (let use = 1; use <= Math.min(sameVal.length, size); use++) {
                    let jNeeded = size - use;
                    if (jNeeded <= jLeft) {
                        let next = [...remaining];
                        for(let i=0; i<use; i++) {
                            let idx = next.findIndex(c => c.v === first.v);
                            next.splice(idx, 1);
                        }
                        if (solve(next, jLeft - jNeeded)) return true;
                    }
                }
            }
            
            // Kontrollo rradhët (Sequences)
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
    const s = ['♠', '♣', '♥', '♦'], v = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for(let i=0; i<2; i++) {
        s.forEach(sym => v.forEach(val => d.push({v: val, s: sym})));
    }
    return d.sort(() => Math.random() - 0.5);
}

// Nisja e serverit
server.listen(process.env.PORT || 10000, () => {
    console.log("Serveri po punon në portin 10000");
});
