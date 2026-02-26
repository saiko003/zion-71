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
    socket.on('joinGame', (name) => {
        if (players.length < 5) {
            players.push({ id: socket.id, name: name, score: 0, hand: [], eliminated: false });
            sendGameState();
        }
    });

    socket.on('startGame', () => {
        if (players.length < 2) return;
        deck = createFullDeck();
        currentTurnIndex = 0;
        players.forEach((p, i) => {
            let count = (i === currentTurnIndex) ? 10 : 9;
            p.hand = deck.splice(0, count);
            p.hand.push({ v: '★', s: 'X' });
            io.to(p.id).emit('receiveCards', p.hand);
        });
        sendGameState();
    });

    socket.on('drawCard', () => {
        if (players[currentTurnIndex]?.id === socket.id) {
            const card = deck.pop();
            io.to(socket.id).emit('cardDrawn', card);
        }
    });

    socket.on('endTurn', () => {
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        sendGameState();
    });

    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        io.emit('roundOver', { winnerName: winner.name, isFlush: data.isFlush });
    });

    socket.on('submitMyPoints', (data) => {
        const p = players.find(player => player.id === socket.id);
        if (p) p.score += data.points;
        sendGameState();
    });

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({ name: p.name, id: p.id, score: p.score })),
            activePlayerId: players[currentTurnIndex]?.id
        });
    }
});

function createFullDeck() {
    let d = [];
    const s = ['♠', '♣', '♥', '♦'], v = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for(let i=0; i<2; i++) s.forEach(sym => v.forEach(val => d.push({v: val, s: sym})));
    return d.sort(() => Math.random() - 0.5);
}

server.listen(process.env.PORT || 10000);
