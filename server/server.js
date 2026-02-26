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
let dealerIndex = 0; 
let deck = [];
let gameInProgress = false;

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);

    // JOIN GAME
    socket.on('joinGame', (playerName) => {
        // RREGULLI: Maksimumi 5 lojtarë dhe nuk hyhet dot nëse loja ka nisur
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
            console.log(`${newPlayer.name} u bashkua.`);
            sendGameState();
        } else if (gameInProgress) {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Loja ka nisur, prit raundin tjetër.' });
        }
    });

    // START GAME / NEXT ROUND
    socket.on('startGame', () => {
        // RREGULLI: Loja duhet të ketë 2 deri në 5 lojtarë
        if (players.length < 2) {
            socket.emit('receiveMessage', { user: 'SISTEMI', text: 'Duhen të paktën 2 lojtarë për të nisur!' });
            return;
        }
        
        gameInProgress = true;
        deck = createFullDeck(); 
        
        // Ndarësi fillon raundin
        currentTurnIndex = dealerIndex;

        players.forEach((player, index) => {
            if (!player.eliminated) {
                player.pointsSubmitted = false;
                // Ndarësi (index === dealerIndex) merr 10 letra, të tjerët 9
                let cardsToGive = (index === dealerIndex) ? 10 : 9;
                player.hand = deck.splice(0, cardsToGive);
                
                // Çdo lojtar merr 1 Xhoker (★) automatikisht
                player.hand.push({ v: '★', s: 'X', type: 'joker' }); 
                
                io.to(player.id).emit('receiveCards', player.hand);
            }
        });

        // Jackpot (letra nën stivë)
        let jackpotCard = deck.pop();
        io.emit('gameStarted', { 
            jackpot: jackpotCard,
            dealerName: players[dealerIndex].name 
        });

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
            
            // Eliminimi mbi 71 pikë
            if (player.score > 71) {
                player.eliminated = true;
            }
        }

        // Kontrolli nëse raundi u mbyll nga të gjithë
        const activePlayers = players.filter(p => !p.eliminated);
        if (players.every(p => p.pointsSubmitted || p.eliminated)) {
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
        io.emit('receiveMessage', {
            user: data.user,
            text: data.text
        });
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length < 2) gameInProgress = false;
        if (currentTurnIndex >= players.length) currentTurnIndex = 0;
        sendGameState();
    });

    function moveToNextPlayer() {
        let attempts = 0;
        do {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            attempts++;
        } while (players[currentTurnIndex].eliminated && attempts < players.length);
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
