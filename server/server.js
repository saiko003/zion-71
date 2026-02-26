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
let dealerIndex = 0; // Pika 2: Roli i ndarësit që lëviz
let deck = [];
let gameInProgress = false;

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);

    // JOIN GAME
    socket.on('joinGame', (playerName) => {
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
            sendGameState();
        }
    });

    // START GAME / NEXT ROUND (Pika 2 & 16)
    socket.on('startGame', () => {
        if (players.length < 2) return;
        
        gameInProgress = true;
        deck = createFullDeck(); 
        
        // Pika 16: Radhën e fillon Ndarësi (Dealer)
        currentTurnIndex = dealerIndex;

        players.forEach((player, index) => {
            player.pointsSubmitted = false;
            // Pika 1: Ndarësi merr 10 letra + 1 Xhoker, të tjerët 9 + 1 Xhoker
            let cardsToGive = (index === dealerIndex) ? 10 : 9;
            
            player.hand = deck.splice(0, cardsToGive);
            // Pika 1: Shtohet Xhokeri automatikisht
            player.hand.push({ v: '★', s: 'X', type: 'joker' }); 
            
            io.to(player.id).emit('receiveCards', player.hand);
        });

        // Pika 6: Jackpot (letra vertikale poshtë stivës)
        let jackpotCard = deck.pop();
        io.emit('gameStarted', { 
            jackpot: jackpotCard,
            dealerName: players[dealerIndex].name 
        });

        sendGameState();
    });

    // DRAW CARD (Pika 3 & 12)
    socket.on('drawCard', () => {
        const currentPlayer = players[currentTurnIndex];
        if (currentPlayer && currentPlayer.id === socket.id && deck.length > 0) {
            const newCard = deck.pop();
            io.to(socket.id).emit('cardDrawn', newCard);
            // Nëse mbaron stiva, Pika 3 thotë të përzihen letrat (do shtohet në v2)
        }
    });

    // END TURN (Pika 10 & 15)
    socket.on('endTurn', () => {
        if (players.length > 0) {
            moveToNextPlayer();
            sendGameState();
        }
    });

    // PLAYER CLOSED (Pika 7)
    socket.on('playerClosed', (data) => {
        const winner = players.find(p => p.id === socket.id);
        if (!winner) return;

        io.emit('roundOver', {
            winnerName: winner.name,
            winnerId: socket.id,
            isFlush: data.isFlush
        });
    });

    // SUBMIT POINTS (Pika 17)
    socket.on('submitMyPoints', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (player && !player.pointsSubmitted) {
            player.score += data.points;
            player.pointsSubmitted = true;
            
            // Pika 9: Eliminimi në 71
            if (player.score > 71) {
                player.eliminated = true;
            }
        }

        // Kontrollo nëse të gjithë kanë dërguar pikët për të përgatitur raundin tjetër
        if (players.every(p => p.pointsSubmitted || p.eliminated)) {
            prepareNextRound();
        }
        sendGameState();
    });

    // CHAT (Pika 14)
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

    // FUNKSIONET NDIHMËSE
    function moveToNextPlayer() {
        let attempts = 0;
        do {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            attempts++;
        } while (players[currentTurnIndex].eliminated && attempts < players.length);
    }

    function prepareNextRound() {
        // Pika 16: Roli i ndarësit lëviz me radhë
        dealerIndex = (dealerIndex + 1) % players.length;
        // Nëse ndarësi i ri është i eliminuar, lëvize te tjetri
        while (players[dealerIndex].eliminated && players.filter(p => !p.eliminated).length > 1) {
            dealerIndex = (dealerIndex + 1) % players.length;
        }
        gameInProgress = false; 
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
    // Pika 1: 2 pako letra (104 letra)
    for (let i = 0; i < 2; i++) {
        symbols.forEach(s => values.forEach(v => newDeck.push({ v, s })));
    }
    // Shuffle
    return newDeck.sort(() => Math.random() - 0.5);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Serveri ZION 71 po punon te porti ${PORT}`);
});
