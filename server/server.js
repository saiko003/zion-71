
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

let dealerIndex = 0; // Kush e nis lojën

function endRound(winnerId, allPlayersCards) {
    allPlayersCards.forEach(player => {
        if (player.id === winnerId) {
            player.totalScore += 0; // Fituesi merr 0 (X)
            player.roundHistory.push('X');
        } else {
            // Llogarit pikët e mbetura (letrat jashtë grupeve)
            let penalty = calculatePenalty(player.cards); 
            player.totalScore += penalty;
            player.roundHistory.push(penalty);
        }
        
        // Kontrollo nëse lojtari u eliminua
        if (player.totalScore >= 71) {
            player.isOut = true;
        }
    });

    // Kalojmë Dealer-in te tjetri që nuk është eliminuar
    dealerIndex = (dealerIndex + 1) % players.length;
    while(players[dealerIndex].isOut) {
        dealerIndex = (dealerIndex + 1) % players.length;
    }
}
// Krijimi i 2 pakove me letra (104 letra)
function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    
    // 2 pako (104 letra gjithsej)
    for (let p = 0; p < 2; p++) {
        for (let s of suits) {
            for (let v of values) {
                newDeck.push({ v, s });
            }
        }
    }
    
    // Shuffle (Përzierja)
    return newDeck.sort(() => Math.random() - 0.5);
}
function startNewRound() {
    let deck = createDeck(); 
    shuffle(deck);

    // Sigurohemi që kemi një dealer (nëse jo, bëje lojtarin e parë)
    if (currentDealerIndex === undefined || currentDealerIndex === null) {
        currentDealerIndex = 0;
    }

    players.forEach((player, index) => {
        // 1. Krijojmë një Xhoker të ri flakë për çdo lojtar
        const myJoker = { v: '★', s: 'Xhoker' };

        // 2. Marrim letrat normale nga deçka
        let sasiaNgaDeck = (index === currentDealerIndex) ? 10 : 9;
        let letratNgaDeck = deck.splice(0, sasiaNgaDeck);

        // 3. BASHKIMI I DETYRUAR (Xhokeri VETËM 1 herë në fillim)
        // Përdorim rreshtin poshtë që fshin çdo gjë të vjetër
        player.cards = [myJoker].concat(letratNgaDeck);

        console.log(`DEBUG: Lojtari ${player.name} mori Xhokerin + ${letratNgaDeck.length} letra.`);
    });

    gameDeck = deck;
    discardPile = [];
    
    // Dealer-i luan i pari (ka 11 letra)
    activePlayerIndex = currentDealerIndex;

    broadcastState(); 
}
// ==========================================
// 2. KOMUNIKIMI ME LOJTARËT
// ==========================================
io.on('connection', (socket) => {
    console.log("Lojtar i ri u lidh:", socket.id);

    // KORRIGJUAR: socket (jo ssocket)
    socket.on('joinGame', (playerName) => {
        const newPlayer = {
            id: socket.id,
            name: playerName || "Lojtar i panjohur",
            cards: [],
            score: 0,
            history: [],
            isOut: false
        };
           
        players.push(newPlayer);
        console.log(`${newPlayer.name} u shtua në lojë.`);
        
        // broadcastState duhet të jetë BRENDA socket.on që të lajmërojë 
        // të tjerët sapo ky lojtar të shtohet në listë
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
    
    // 1. Kontrolli i radhës dhe i numrit të letrave (duhet të ketë saktësisht 10 për të tërhequr)
    if (!player || player.id !== socket.id || player.cards.length !== 10) return;

    // 2. Sigurohemi që deçka (deck) nuk është bosh
    if (newDeck && newDeck.length > 0) {
        const drawnCard = newDeck.pop(); // Marrim letrën e fundit
        player.cards.push(drawnCard);

        console.log(`${player.name} tërhoqi një letër. Tani ka ${player.cards.length} letra.`);

        // 3. Njoftojmë lojtarin specifik dhe gjithë grupin
        // socket.emit('cardDrawn', drawnCard); // Mund ta mbash, por broadcastState mjafton
        broadcastState();
    } else {
        console.log("Deçka është bosh! Nuk ka më letra për të tërhequr.");
        // Këtu mund të shtosh logjikën për të rrotulluar discardPile nëse dëshiron
    }
});

    // HEDHJA E LETRËS (Pika 10)
    // server.js
socket.on('cardDiscarded', (card) => {
    const player = players[activePlayerIndex];
    if (!player || player.id !== socket.id) return;

    // 1. MBROJTJA: Mos lejo hedhjen e Xhokerit (★)
    if (card.v === '★' || card.v === 'Xhoker') {
        console.log("Tentativë për të hedhur Xhokerin u bllokua!");
        return; 
    }

    // 2. GJEJMË POZICIONIN E LETRËS (Vetëm për njërën)
    const cardIndex = player.cards.findIndex(c => c.v === card.v && c.s === card.s);
    
    if (cardIndex !== -1) {
        // 3. splice(index, 1) heq VETËM 1 letër në atë pozicion
        const removedCard = player.cards.splice(cardIndex, 1)[0];
        
        // 4. E shtojmë te stiva e hedhjes (në tokë)
        discardPile.push(removedCard);
        
        // 5. Kalojmë radhën te tjetri
        activePlayerIndex = (activePlayerIndex + 1) % players.length;
        
        console.log(`${player.name} hodhi ${card.v}${card.s}. I mbeten ${player.cards.length} letra.`);
        broadcastState();
    }
});

    // MBYLLJA (ZION!)
socket.on('playerClosed', (data) => {
    const winner = players.find(p => p.id === socket.id);
    if (!winner) return;

    console.log(`${winner.name} ka bërë ZION!`);

    // Llogarit pikët e të tjerëve
    players.forEach(p => {
        if (p.id !== winner.id) {
            // Përdorim calculateScore që është më i saktë për Zion
            let roundPoints = calculateScore(p.cards); 
            p.score += roundPoints;
            p.history.push(roundPoints);
        } else {
            p.history.push("X"); // Fituesi merr X
        }
    });

    // Dërgojmë sinjalin te të gjithë që raundi mbaroi
    io.emit('roundOver', {
        winnerName: winner.name,
        updatedPlayers: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history,
            isOut: p.score >= 71 
        }))
    });
});

    socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    broadcastState();
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveri po punon në portën ${PORT}`));

// server.js

// Ky funksion do të përdoret kur dikush thërret "ZION"
function calculateScore(cards) {
    let score = 0;
    if (!cards) return 0;

    cards.forEach(card => {
        // Xhokeri nuk llogaritet (0 pikë)
        if (card.v === '★' || card.v === 'Xhoker' || card.s === 'Joker') return;

        // Nëse është 10, J, Q, K ose A, shto 10 pikë
        if (['10', 'J', 'Q', 'K', 'A'].includes(card.v)) {
            score += 10;
        } else {
            // Për letrat 2-9, shto vlerën e tyre numerike
            let val = parseInt(card.v);
            if (!isNaN(val)) score += val;
        }
    });
    return score;
}
    function broadcastState() {
    io.emit('updateGameState', {
        players: players.map(p => ({ id: p.id, name: p.name, score: p.score, history: p.history })),
        activePlayerId: players[activePlayerIndex]?.id,
        discardPileTop: discardPile[discardPile.length - 1],
        jackpotCard: jackpotCard
    });
}
