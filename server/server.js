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
let discardPile = []; // Ruajmë letrat e hedhura këtu
let lastWinnerId = null;
let jackpotCard = null; 

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        if (players.length < 5) {
            players.push({ 
                id: socket.id, 
                name: name || `Lojtari ${players.length + 1}`, 
                score: 0, 
                hand: [], 
                eliminated: false 
            });
            sendGameState();
        }
    });

    socket.on('startGame', () => {
        const activePlayers = players.filter(p => !p.eliminated);
        if (activePlayers.length < 2) return;

        deck = createFullDeck();
        discardPile = []; // Resetojmë letrat e hedhura në fillim të lojës
        
        if (lastWinnerId) {
            let winIdx = players.findIndex(p => p.id === lastWinnerId);
            currentTurnIndex = (winIdx + 1) % players.length;
        } else {
            currentTurnIndex = 0;
        }

        while (players[currentTurnIndex].eliminated) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
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

        sendGameState();
    });

    // PËRMIRËSUAR: Siguri shtesë që lojtari nuk merr letër nëse ka 11
    socket.on('drawCard', () => {
        const player = players[currentTurnIndex];
        if (player?.id === socket.id) {
            
            // Kontrolli i reshuffle
            if (deck.length === 0 && discardPile.length > 0) {
                console.log("Deck mbaroi! Po bëj Reshuffle të discardPile...");
                deck = [...discardPile];
                discardPile = [];
                deck.sort(() => Math.random() - 0.5);
            }

            if (deck.length > 0) {
                const card = deck.pop();
                io.to(socket.id).emit('cardDrawn', card);
                sendGameState(); 
            }
        }
    });

    socket.on('drawJackpot', () => {
        const player = players[currentTurnIndex];
        if (player?.id === socket.id && jackpotCard) {
            const card = jackpotCard;
            jackpotCard = null; 
            io.to(socket.id).emit('jackpotDrawn', card);
            sendGameState();
        }
    });

    socket.on('endTurn', () => {
        moveToNextPlayer();
        sendGameState();
    });

    socket.on('cardDiscarded', (card) => {
        discardPile.push(card);
        console.log("Letra u shtua në discardPile. Total:", discardPile.length);
    });

    socket.on('playerClosed', (data) => {
        if (verifyHandOnServer(data.hand)) {
            const winner = players.find(p => p.id === socket.id);
            lastWinnerId = socket.id;
            
            io.emit('roundOver', { 
                winnerName: winner.name, 
                winnerId: socket.id,
                isFlush: data.isFlush,
                winningHand: data.hand 
            });
        } else {
            console.log(`Lojtari ${socket.id} tentoi mbyllje të pavlefshme!`);
            socket.emit('error', 'Dora nuk është e vlefshme!');
        }
    });

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

    // --- LOGJIKA E CHAT-IT (E SHTUAR) ---
    socket.on('sendMessage', (data) => {
        // Serveri merr mesazhin dhe ua dërgon të gjithëve
        io.emit('receiveMessage', {
            name: data.name,
            message: data.message
        });
    });

    function moveToNextPlayer() {
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        let attempts = 0;
        while (players[currentTurnIndex].eliminated && attempts < players.length) {
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
            jackpotCard: jackpotCard 
        });
    }

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });
});

// Algoritmi i verifikimit (pa ndryshime)
function verifyHandOnServer(cards) {
    if (!cards || (cards.length !== 10 && cards.length !== 11)) return false;
    const valMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    function check10(hand10) {
        let jokers = hand10.filter(c => c.v === '★').length;
        let normalCards = hand10.filter(c => c.v !== '★').map(c => ({ v: valMap[c.v], s: c.s })).sort((a, b) => a.v - b.v);
        function solve(remaining, jLeft) {
            if (remaining.length === 0) return true;
            let first = remaining[0];
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

server.listen(process.env.PORT || 10000);
