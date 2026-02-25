const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let players = []; 
let currentTurnIndex = 0;
let deck = [];

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);

    // JOIN GAME
    socket.on('joinGame', (playerName) => {
        if (players.length < 5) {
            const newPlayer = {
                id: socket.id,
                name: playerName || `Lojtari ${players.length + 1}`,
                score: 0,
                hand: [],
                eliminated: false
            };
            players.push(newPlayer);
            sendGameState();
        }
    });

    // START GAME
    socket.on('startGame', () => {
        if (players.length < 2) return;

        deck = createFullDeck(); 
        currentTurnIndex = 0; // Gjithmonë fillon lojtari i parë

        players.forEach((player) => {
            player.hand = deck.splice(0, 9);
            player.hand.push({ v: '★', s: 'X', type: 'joker' }); // Xhokeri fiks
            io.to(player.id).emit('receiveCards', player.hand);
        });

        let jackpotCard = deck.pop();
        io.emit('gameStarted', { jackpot: jackpotCard });
        sendGameState();
    });

    // DRAW CARD (E shtova që serveri të menaxhojë stivën)
    socket.on('drawCard', () => {
        if (players[currentTurnIndex].id === socket.id && deck.length > 0) {
            const newCard = deck.pop();
            io.to(socket.id).emit('cardDrawn', newCard);
        }
    });

    // END TURN
    socket.on('endTurn', () => {
        if (players.length > 0) {
            // Kalojmë rradhën te lojtari tjetër që nuk është eliminuar
            do {
                currentTurnIndex = (currentTurnIndex + 1) % players.length;
            } while (players[currentTurnIndex].eliminated && players.filter(p => !p.eliminated).length > 1);

            sendGameState();
        }
    });

    // PLAYER CLOSED (MBYLLJA)
    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        if (!winner) return;

        io.emit('roundOver', {
            winnerName: winner.name,
            isFlush: data.isFlush
        });
    });

    // SUBMIT POINTS
    socket.on('submitMyPoints', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.score += data.points;
            if (player.score >= 71) player.eliminated = true;
        }
        sendGameState();
    });

    // CHAT
    socket.on('sendMessage', (data) => {
        io.emit('receiveMessage', {
            user: data.user,
            text: data.text
        });
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
        console.log('Lojtari u largua.');
    });

    // Funksion ndihmës për të dërguar gjendjen e lojës (që të mos përsërisim kod)
    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({ 
                name: p.name, 
                id: p.id, 
                score: p.score, 
                eliminated: p.eliminated 
            })),
            activePlayerId: (players.length > 0 && players[currentTurnIndex]) ? players[currentTurnIndex].id : null
        });
    }
});

function createFullDeck() {
    let newDeck = [];
    const symbols = ['♠', '♣', '♥', '♦'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    // 2 palë letra (si Zion-i origjinal)
    for (let i = 0; i < 2; i++) {
        symbols.forEach(s => values.forEach(v => newDeck.push({ v, s })));
    }
    return newDeck.sort(() => Math.random() - 0.5);
}

const PORT = process.env.PORT || 10000; // Porti 10000 preferohet nga Render
server.listen(PORT, () => {
    console.log(`Serveri po punon te porti ${PORT}`);
});
