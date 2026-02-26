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
let lastWinnerId = null;
let jackpotCard = null; // Ruajmë letrën Jackpot që shohin të gjithë

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
        
        if (lastWinnerId) {
            let winIdx = players.findIndex(p => p.id === lastWinnerId);
            currentTurnIndex = (winIdx + 1) % players.length;
        } else {
            currentTurnIndex = 0;
        }

        while (players[currentTurnIndex].eliminated) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
        }

        // Shpërndajmë letrat lojtarëve
        players.forEach((p, i) => {
            if (!p.eliminated) {
                let count = (i === currentTurnIndex) ? 10 : 9;
                p.hand = deck.splice(0, count);
                p.hand.push({ v: '★', s: 'X' }); 
                io.to(p.id).emit('receiveCards', p.hand);
            }
        });

        // LOGJIKA E RE: Letra e Jackpot-it merret nga fundi i stivës pas shpërndarjes
        if (deck.length > 0) {
            jackpotCard = deck.pop(); 
        }

        sendGameState();
    });

    socket.on('drawCard', () => {
        if (players[currentTurnIndex]?.id === socket.id && deck.length > 0) {
            const card = deck.pop();
            io.to(socket.id).emit('cardDrawn', card);
        }
    });

    socket.on('endTurn', () => {
        moveToNextPlayer();
        sendGameState();
    });

    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        lastWinnerId = socket.id;
        io.emit('roundOver', { winnerName: winner.name, isFlush: data.isFlush });
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
            jackpotCard: jackpotCard // Kjo i tregon front-end-it çfarë të vizatojë te stiva
        });
    }

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });
});

function createFullDeck() {
    let d = [];
    const s = ['♠', '♣', '♥', '♦'], v = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for(let i=0; i<2; i++) {
        s.forEach(sym => v.forEach(val => d.push({v: val, s: sym})));
    }
    return d.sort(() => Math.random() - 0.5);
}

server.listen(process.env.PORT || 10000);
