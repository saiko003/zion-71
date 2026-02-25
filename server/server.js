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

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);

    // JOIN GAME
    socket.on('joinGame', (playerName) => {
        if (players.length < 5) {
            const newPlayer = {
                id: socket.id,
                name: playerName,
                score: 0,
                hand: []
            };
            players.push(newPlayer);
            
            io.emit('updateGameState', {
                players: players.map(p => ({ name: p.name, id: p.id, score: p.score })),
                activePlayerId: (players.length > 0 && players[currentTurnIndex]) ? players[currentTurnIndex].id : null
            });
        }
    });

    // START GAME
    socket.on('startGame', () => {
        if (players.length < 2) return;

        let deck = createFullDeck(); 
        players.forEach((player) => {
            player.hand = deck.splice(0, 9);
            player.hand.push({ v: 'X', s: '★', type: 'joker' });
            io.to(player.id).emit('receiveCards', player.hand);
        });

        let jackpotCard = deck.pop();
        io.emit('gameStarted', { jackpot: jackpotCard });
    });

    // END TURN
    socket.on('endTurn', () => {
        if (players.length > 0) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            io.emit('newTurn', {
                activePlayerId: players[currentTurnIndex].id
            });
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

        io.emit('updateGameState', {
            players: players.map(p => ({ name: p.name, id: p.id, score: p.score, eliminated: p.eliminated })),
            activePlayerId: (players.length > 0 && players[currentTurnIndex]) ? players[currentTurnIndex].id : null
        });
    });

    // CHAT
    socket.on('sendMessage', (text) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            io.emit('receiveMessage', {
                user: player.name,
                text: text
            });
        }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        
        io.emit('updateGameState', {
            players: players.map(p => ({ name: p.name, id: p.id, score: p.score })),
            activePlayerId: (players.length > 0 && players[currentTurnIndex]) ? players[currentTurnIndex].id : null
        });
        console.log('Lojtari u largua.');
    });
});

function createFullDeck() {
    let newDeck = [];
    const symbols = ['♠', '♣', '♥', '♦'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    for (let i = 0; i < 2; i++) {
        symbols.forEach(s => values.forEach(v => newDeck.push({ v, s })));
    }
    return newDeck.sort(() => Math.random() - 0.5);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveri po punon te porti ${PORT}`);
});