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

io.on('connection', (socket) => {
    socket.on('joinGame', (playerName) => {
        if (players.length < 5) {
            players.push({
                id: socket.id,
                name: playerName || `Lojtari ${players.length + 1}`,
                score: 0,
                hand: [],
                eliminated: false
            });
            sendGameState();
        }
    });

    socket.on('startGame', () => {
        if (players.length < 2) return;
        deck = createFullDeck(); 
        currentTurnIndex = 0; 

        players.forEach((player, index) => {
            // Lojtari i parë merr 10 + 1 xhoker = 11. Të tjerët 9 + 1 = 10.
            let count = (index === currentTurnIndex) ? 10 : 9;
            player.hand = deck.splice(0, count);
            player.hand.push({ v: '★', s: 'X' }); 
            io.to(player.id).emit('receiveCards', player.hand);
        });
        
        io.emit('gameStarted', { jackpot: deck.pop() });
        sendGameState();
    });

    socket.on('drawCard', () => {
        if (players[currentTurnIndex]?.id === socket.id && deck.length > 0) {
            const card = deck.pop();
            io.to(socket.id).emit('cardDrawn', card);
        }
    });

    socket.on('endTurn', () => {
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        while (players[currentTurnIndex].eliminated) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
        }
        sendGameState();
    });

    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        io.emit('roundOver', { winnerName: winner.name, isFlush: data.isFlush });
    });

    socket.on('submitMyPoints', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.score += data.points;
            if (player.score >= 71) player.eliminated = true;
        }
        sendGameState();
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({ name: p.name, id: p.id, score: p.score, eliminated: p.eliminated })),
            activePlayerId: players[currentTurnIndex]?.id
        });
    }
});

function createFullDeck() {
    let d = [];
    const syms = ['♠', '♣', '♥', '♦'], vals = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for(let i=0; i<2; i++) syms.forEach(s => vals.forEach(v => d.push({v, s})));
    return d.sort(() => Math.random() - 0.5);
}

server.listen(process.env.PORT || 10000);
