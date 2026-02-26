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
        // Duhen te pakten 2 lojtare jo te eliminuar
        const activePlayers = players.filter(p => !p.eliminated);
        if (activePlayers.length < 2) return;

        deck = createFullDeck();
        
        // Kush fiton raundin, nis i dyti (rregull i Zion-it) ose thjesht rradha pasardhese
        if (lastWinnerId) {
            let winIdx = players.findIndex(p => p.id === lastWinnerId);
            currentTurnIndex = (winIdx + 1) % players.length;
        } else {
            currentTurnIndex = 0;
        }

        // Sigurohemi qe nuk nis rradha te nje i eliminuar
        while (players[currentTurnIndex].eliminated) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
        }

        players.forEach((p, i) => {
            if (!p.eliminated) {
                let count = (i === currentTurnIndex) ? 10 : 9;
                p.hand = deck.splice(0, count);
                p.hand.push({ v: '★', s: 'X' }); // Xhokeri fillestar
                io.to(p.id).emit('receiveCards', p.hand);
            }
        });
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
        // Dergo njoftimin nese eshte Flush (per piket 2x)
        io.emit('roundOver', { winnerName: winner.name, isFlush: data.isFlush });
    });

    socket.on('submitMyPoints', (data) => {
        const p = players.find(player => player.id === socket.id);
        if (p) {
            // Nese dikush u mbyll Flush, piket tona dyfishohen
            let finalPoints = data.isFlush ? data.points * 2 : data.points;
            p.score += finalPoints;

            // Rregulli i eliminimit: 71
            if (p.score > 71) {
                p.eliminated = true;
            }
        }
        sendGameState();
    });

    function moveToNextPlayer() {
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        // Kaperce lojtaret e eliminuar
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
            deckCount: deck.length
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
    // 2 pako letra (104 total)
    for(let i=0; i<2; i++) {
        s.forEach(sym => v.forEach(val => d.push({v: val, s: sym})));
    }
    return d.sort(() => Math.random() - 0.5);
}

server.listen(process.env.PORT || 10000);
