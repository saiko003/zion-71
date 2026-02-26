const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = [];
let currentTurnIndex = 0;
let dealerIndex = 0;
let deck = [];
let gameInProgress = false;

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh me ID:', socket.id);

    // --- JOIN GAME ---
    socket.on('joinGame', (playerName) => {
        if (players.find(p => p.id === socket.id)) return;

        if (players.length < 5 && !gameInProgress) {
            players.push({
                id: socket.id,
                name: playerName || `Lojtari ${players.length + 1}`,
                score: 0,
                hand: [],
                eliminated: false,
                pointsSubmitted: false,
                isActive: false
            });
            sendGameState();
        } else {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Tavolina është plot ose loja ka nisur.' });
        }
    });

    // --- START GAME ---
    socket.on('startGame', () => {
        if (players.length < 2) {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Duhen të paktën 2 lojtarë për të nisur lojën!' });
            return;
        }

        gameInProgress = true;
        deck = createFullDeck();
        currentTurnIndex = dealerIndex;

        // Jep Xhoker të gjithë lojtarëve
        players.forEach((player, index) => {
            if (!player.eliminated) {
                player.pointsSubmitted = false;
                let cardsToGive = (index === dealerIndex) ? 10 : 9;
                player.hand = deck.splice(0, cardsToGive);
                player.hand.push({ v: '★', s: 'X', type: 'joker' });
                io.to(player.id).emit('receiveCards', player.hand);
            }
        });

        // Ndarësi hedh 1 letër në tokë (opsionale)
        const dealer = players[dealerIndex];
        if (dealer && dealer.hand.length > 0) {
            const firstCard = dealer.hand.shift(); // hedh letra e parë
            io.emit('cardOnTable', { card: firstCard, playerId: dealer.id });
        }

        // Jackpot
        let jackpotCard = deck.pop();
        io.emit('gameStarted', { jackpot: jackpotCard, dealerName: dealer.name });

        sendGameState();
    });

    // --- DRAW CARD ---
    socket.on('drawCard', () => {
        const currentPlayer = players[currentTurnIndex];
        if (!gameInProgress || !currentPlayer || currentPlayer.id !== socket.id) return;
        if (deck.length === 0) return;

        const newCard = deck.pop();
        currentPlayer.hand.push(newCard);
        io.to(socket.id).emit('cardDrawn', newCard);
        sendGameState();
    });

    // --- END TURN ---
    socket.on('endTurn', () => {
        if (!gameInProgress) return;
        moveToNextPlayer();
        sendGameState();
    });

    // --- PLAYER CLOSED ---
    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        if (!winner) return;

        io.emit('roundOver', {
            winnerName: winner.name,
            winnerId: socket.id,
            isFlush: data.isFlush
        });
    });

    // --- SUBMIT POINTS ---
    socket.on('submitMyPoints', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (player && !player.pointsSubmitted) {
            player.score += data.points;
            player.pointsSubmitted = true;
            if (player.score > 71) player.eliminated = true;
        }

        if (players.every(p => p.pointsSubmitted || p.eliminated)) {
            const activePlayers = players.filter(p => !p.eliminated);
            if (activePlayers.length <= 1) {
                io.emit('receiveMessage', { user: 'SISTEMI', text: 'Loja mbaroi! Fituesi: ' + (activePlayers[0]?.name || 'Nuk ka') });
                gameInProgress = false;
            } else {
                prepareNextRound();
            }
        }
        sendGameState();
    });

    // --- CHAT ---
    socket.on('sendMessage', (data) => io.emit('receiveMessage', { user: data.user, text: data.text }));

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length < 2) gameInProgress = false;
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });

    // --- HELPERS ---
    function moveToNextPlayer() {
        if (players.length === 0) return;
        let attempts = 0;
        const total = players.length;
        do {
            currentTurnIndex = (currentTurnIndex + 1) % total;
            attempts++;
        } while (players[currentTurnIndex].eliminated && attempts < total);
    }

    function prepareNextRound() {
        // Pastru duart e lojtarëve
        players.forEach(p => { p.hand = []; p.pointsSubmitted = false; p.isActive = false; });
        // Ndarësi i ri
        dealerIndex = (dealerIndex + 1) % players.length;
        while (players[dealerIndex].eliminated && players.filter(p => !p.eliminated).length > 1) {
            dealerIndex = (dealerIndex + 1) % players.length;
        }
        gameInProgress = false;
        io.emit('receiveMessage', { user: 'SISTEMI', text: 'Raundi u mbyll. Ndarësi i ri mund të nisë lojën.' });
        sendGameState();
    }

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({
                name: p.name,
                id: p.id,
                score: p.score,
                eliminated: p.eliminated,
                handLength: p.hand.length,
                pointsSubmitted: p.pointsSubmitted
            })),
            activePlayerId: players[currentTurnIndex]?.id || null,
            dealerId: players[dealerIndex]?.id || null
        });
    }
});

// --- CREATE DECK ---
function createFullDeck() {
    const newDeck = [];
    const symbols = ['♠', '♣', '♥', '♦'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for (let i=0; i<2; i++) symbols.forEach(s => values.forEach(v => newDeck.push({v,s})));
    return newDeck.sort(() => Math.random() - 0.5);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Serveri ZION 71 po punon te porti ${PORT}`));
