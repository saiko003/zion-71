
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

// ==========================================
// 1. VARIABLAT E LOJËS (Pika 1, 2)
// ==========================================
let players = [];
let deck = [];
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let gameStarted = false;

// Krijimi i 2 pakove me letra (104 letra)
function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    
    // 2 pako
    for (let p = 0; p < 2; p++) {
        for (let s of suits) {
            for (let v of values) {
                newDeck.push({ v, s });
            }
        }
    }
    // Shto 2 Xhokera (Pika 5)
    newDeck.push({ v: '★', s: 'Xhoker' }, { v: '★', s: 'Xhoker' });
    
    // Përzierja (Shuffle)
    return newDeck.sort(() => Math.random() - 0.5);
}

// ==========================================
// 2. KOMUNIKIMI ME LOJTARËT
// ==========================================
io.on('connection', (socket) => {
    console.log("Lojtar i ri u lidh:", socket.id);

    socket.on('joinGame', (name) => {
        if (!players.find(p => p.id === socket.id)) {
            players.push({
                id: socket.id,
                name: name,
                cards: [],
                score: 0,
                history: [] // Pika 17: R1, R2, R3...
            });
        }
        broadcastState();
    });

    // START GAME (Pika 2)
    socket.on('startGame', () => {
        if (players.length < 2) return;
        
        gameStarted = true;
        deck = createDeck();
        discardPile = [];
        
        // Shpërndarja (Ndarësi merr 11, të tjerët 10 - Pika 2)
        players.forEach((player, index) => {
            const count = (index === activePlayerIndex) ? 11 : 10;
            player.cards = deck.splice(0, count);
            io.to(player.id).emit('receiveCards', player.cards);
        });

        // Jackpot (Pika 6)
        jackpotCard = deck.pop();
        
        broadcastState();
    });

    // TËRHEQJA E LETRËS (Pika 12)
    socket.on('drawCard', () => {
        const player = players[activePlayerIndex];
        if (player.id !== socket.id || player.cards.length >= 11) return;

        const drawnCard = deck.pop();
        player.cards.push(drawnCard);
        
        socket.emit('cardDrawn', drawnCard);
        broadcastState();
    });

    // HEDHJA E LETRËS (Pika 10)
    socket.on('cardDiscarded', (card) => {
        const player = players[activePlayerIndex];
        if (player.id !== socket.id) return;

        // Heqim letrën nga dora e lojtarit në server
        player.cards = player.cards.filter(c => !(c.v === card.v && c.s === card.s));
        
        discardPile.push(card);
        
        // Kalojmë radhën te lojtari tjetër (Pika 15)
        activePlayerIndex = (activePlayerIndex + 1) % players.length;
        
        broadcastState();
    });

    // MBYLLJA (ZION! - Pika 7, 8)
    socket.on('playerClose', (finalHand) => {
        const winner = players.find(p => p.id === socket.id);
        
        // Llogarit pikët e të tjerëve (Pika 17)
        players.forEach(p => {
            if (p.id !== winner.id) {
                let roundPoints = calculatePoints(p.cards);
                p.score += roundPoints;
                p.history.push(roundPoints);
            } else {
                p.history.push("X"); // Fituesi
            }
        });

        io.emit('roundOver', {
            winnerName: winner.name,
            updatedPlayers: players
        });
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        broadcastState();
    });
});

// Funksioni që njofton të gjithë për gjendjen e lojës
function broadcastState() {
    io.emit('updateGameState', {
        players: players.map(p => ({ id: p.id, name: p.name, score: p.score, history: p.history })),
        activePlayerId: players[activePlayerIndex]?.id,
        discardPileTop: discardPile[discardPile.length - 1],
        jackpotCard: jackpotCard
    });
}

// Llogaritja e pikëve (Pika 8)
function calculatePoints(cards) {
    let sum = 0;
    cards.forEach(c => {
        if (['10', 'J', 'Q', 'K', 'A'].includes(c.v)) sum += 10;
        else if (c.v === '★') sum += 0;
        else sum += parseInt(c.v);
    });
    return sum;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveri po punon në portën ${PORT}`));
