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

    // JOIN GAME
    socket.on('joinGame', (playerName) => {
        // Kontrollo nëse lojtari është tashmë në listë për të shmangur dublikimet
        const existingPlayer = players.find(p => p.id === socket.id);
        if (existingPlayer) return;

        if (players.length < 5 && !gameInProgress) {
            const newPlayer = {
                id: socket.id,
                name: playerName || `Lojtari ${players.length + 1}`,
                score: 0,
                hand: [],
                eliminated: false,
                pointsSubmitted: false
            };
            players.push(newPlayer);
            console.log(`Lojtari u shtua: ${newPlayer.name}. Total: ${players.length}`);
            sendGameState();
        } else {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Tavolina është plot ose loja ka nisur.' });
        }
    });

    // START GAME
    socket.on('startGame', () => {
        console.log(`Tentativa për nisje nga ${socket.id}. Lojtarë prezentë: ${players.length}`);

        // RREGULLI: Duhen të paktën 2 lojtarë
        if (players.length < 2) {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Duhen të paktën 2 lojtarë për të nisur lojën!' });
            console.log("Nisja dështoi: Mungojnë lojtarët.");
            return;
        }
        
        gameInProgress = true;
        deck = createFullDeck(); 
        currentTurnIndex = dealerIndex;

        players.forEach((player, index) => {
            if (!player.eliminated) {
                player.pointsSubmitted = false;
                // Ndarësi fillon me 10, të tjerët 9
                let cardsToGive = (index === dealerIndex) ? 10 : 9;
                player.hand = deck.splice(0, cardsToGive);
                
                // Shto Xhokerin (★)
                player.hand.push({ v: '★', s: 'X', type: 'joker' }); 
                
                io.to(player.id).emit('receiveCards', player.hand);
            }
        });

        let jackpotCard = deck.pop();
        io.emit('gameStarted', { 
            jackpot: jackpotCard,
            dealerName: players[dealerIndex].name 
        });

        console.log("Loja nisi me sukses!");
        sendGameState();
    });

    // DRAW CARD
    socket.on('drawCard', () => {
        const currentPlayer = players[currentTurnIndex];
        if (currentPlayer && currentPlayer.id === socket.id && deck.length > 0) {
            const newCard = deck.pop();
            io.to(socket.id).emit('cardDrawn', newCard);
        }
    });

    // END TURN
    socket.on('endTurn', () => {
        if (players.length > 0) {
            moveToNextPlayer();
            sendGameState();
        }
    });

    // PLAYER CLOSED
    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        if (!winner) return;

        io.emit('roundOver', {
            winnerName: winner.name,
            winnerId: socket.id,
            isFlush: data.isFlush
        });
    });

    // SUBMIT POINTS
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
                io.emit('receiveMessage', { user: 'SISTEMI', text: 'Loja mbaroi! Kemi një fitues.' });
                gameInProgress = false;
            } else {
                prepareNextRound();
            }
        }
        sendGameState();
    });

    // CHAT
    socket.on('sendMessage', (data) => {
        io.emit('receiveMessage', { user: data.user, text: data.text });
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log('Lojtari u shkëput:', socket.id);
        players = players.filter(p => p.id !== socket.id);
        if (players.length < 2) gameInProgress = false;
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });

    function moveToNextPlayer() {
        let attempts = 0;
        const total = players.length;
        do {
            currentTurnIndex = (currentTurnIndex + 1) % total;
            attempts++;
        } while (players[currentTurnIndex].eliminated && attempts < total);
    }

    function prepareNextRound() {
        dealerIndex = (dealerIndex + 1) % players.length;
        while (players[dealerIndex].eliminated && players.filter(p => !p.eliminated).length > 1) {
            dealerIndex = (dealerIndex + 1) % players.length;
        }
        gameInProgress = false; 
        io.emit('receiveMessage', { user: 'SISTEMI', text: 'Raundi u mbyll. Ndarësi i ri mund të nisë lojën.' });
    }

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({ 
                name: p.name, 
                id: p.id, 
                score: p.score, 
                eliminated: p.eliminated 
            })),
            activePlayerId: (players.length > 0 && players[currentTurnIndex]) ? players[currentTurnIndex].id : null,
            dealerId: players[dealerIndex] ? players[dealerIndex].id : null
        });
    }
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Serveri ZION 71 po punon te porti ${PORT}`);
});
