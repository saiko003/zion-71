
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
    // server.js
socket.on('startGame', () => {
    if (players.length < 2) return; // Sigurohemi që ka të paktën 2 lojtarë

    gameStarted = true;
    deck = createDeck(); // Krijon 104 letra + 2 Xhokera
    discardPile = [];    // Pastron letrat në tokë nga loja e kaluar

    players.forEach((player, index) => {
        // RREGULLI: Lojtari i parë (index 0) merr 11, të tjerët 10
        const saLetra = (index === 0) ? 11 : 10; 
        
        // I marrim letrat nga deku
        player.cards = deck.splice(0, saLetra);
        
        // Ia dërgojmë vetëm këtij lojtari letrat e tij
        io.to(player.id).emit('receiveCards', player.cards);
    });

    // Përcaktojmë Jackpot-in (Letra e parë që mbetet në dek)
    jackpotCard = deck.pop(); 
    
    // Radhën e ka gjithmonë lojtari 0 (ai me 11 letra)
    activePlayerIndex = 0; 

    // Njoftojmë të gjithë që loja nisi
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
    // server.js
socket.on('cardDiscarded', (card) => {
    const player = players[activePlayerIndex];
    if (!player || player.id !== socket.id) return;

    // MBROJTJA: Mos lejo hedhjen e Xhokerit (★)
    if (card.v === '★' || card.v === 'Xhoker') {
        console.log("Tentativë për të hedhur Xhokerin u bllokua!");
        return; 
    }

    // Heqim letrën nga dora e lojtarit në server
    player.cards = player.cards.filter(c => !(c.v === card.v && c.s === card.s));
    
    // E shtojmë te letra në tokë
    discardPile.push(card);
    
    // Kalojmë radhën te tjetri
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
