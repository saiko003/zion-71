const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);
});

let activePlayerId = null; 
let deck = [];
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let gameStarted = false;
let gameDeck = [];
let players = [];
let dealerIndex = 0;

const cardOrder = {
    'A': 14,
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13
};

function getVal(card, highAce = false) {
    if (!card || !card.v) return 0;
    const v = card.v;
    
    if (['★', 'Jokeri', 'Xhoker'].includes(v)) return 0;
    
    if (v === 'A') return highAce ? 14 : 1;
    if (v === 'J') return 11;
    if (v === 'Q') return 12;
    if (v === 'K') return 13;
    
    return parseInt(v) || 0;
}

function isSequence(cards) {
    if (cards.length < 3) return false;

    const suit = cards[0].s;
    if (!cards.every(c => c.s === suit)) return false;

    const valuesLow = cards.map(c => getVal(c, false)).sort((a, b) => a - b);
    const isLow = valuesLow.every((v, i) => i === 0 || v === valuesLow[i - 1] + 1);

    const valuesHigh = cards.map(c => getVal(c, true)).sort((a, b) => a - b);
    const isHigh = valuesHigh.every((v, i) => i === 0 || v === valuesHigh[i - 1] + 1);

    return isLow || isHigh;
}

function isSet(cards) {
    if (cards.length < 3) return false;
    const firstValue = cards[0].v;
    if (!cards.every(c => c.v === firstValue)) return false;
    
    const suits = cards.map(c => c.s);
    return new Set(suits).size === cards.length;
}

function isDoraValid(cards) {
    if (!cards || cards.length === 0) return true;
    
    let jokers = cards.filter(c => ['★', 'Jokeri', 'Xhoker'].includes(c.v)).length;
    let normalCards = cards.filter(c => !['★', 'Jokeri', 'Xhoker'].includes(c.v));

    normalCards.sort((a, b) => {
        if (a.s !== b.s) return a.s.localeCompare(b.s);
        return getVal(a, false) - getVal(b, false);
    });

    function solve(remaining, jks) {
        if (remaining.length === 0) return true;
        
        let first = remaining[0];

        let sameValue = remaining.filter(c => c.v === first.v);
        for (let size of [4, 3]) {
            if (sameValue.length >= size - jks) {
                let maxNormal = Math.min(sameValue.length, size);
                for (let n = maxNormal; n >= 1; n--) {
                    let jNeeded = size - n;
                    if (jNeeded <= jks) {
                        let nextCards = [...remaining];
                        let count = 0;
                        for (let i = 0; i < nextCards.length; i++) {
                            if (count < n && nextCards[i].v === first.v) {
                                nextCards.splice(i, 1);
                                i--; count++;
                            }
                        }
                        if (solve(nextCards, jks - jNeeded)) return true;
                    }
                }
            }
        }

        for (let size = 3; size <= 5; size++) {
            let currentJks = jks;
            let tempRemaining = [...remaining];
            let firstVal = getVal(first, false);
            let suit = first.s;
            let possible = true;
            tempRemaining.shift();

            for (let i = 1; i < size; i++) {
                let targetVal = firstVal + i;
                let idx = tempRemaining.findIndex(c => {
                    let v = getVal(c, targetVal === 14);
                    return v === targetVal && c.s === suit;
                });

                if (idx !== -1) {
                    tempRemaining.splice(idx, 1);
                } else if (currentJks > 0) {
                    currentJks--;
                } else {
                    possible = false;
                    break;
                }
            }
            if (possible && solve(tempRemaining, currentJks)) return true;
        }
        return false;
    }
    return solve(normalCards, jokers);
}

function calculateScore(cards) {
    if (!cards || cards.length === 0) return 0;

    let jokers = cards.filter(c => ['★', 'Jokeri', 'Xhoker', 'joker'].includes(c.v)).length;
    let normalCards = cards.filter(c => !['★', 'Jokeri', 'Xhoker', 'joker'].includes(c.v));

    normalCards.sort((a, b) => getVal(a) - getVal(b));

    function solve(remaining, jks) {
        if (remaining.length === 0) return 0;

        let first = remaining[0];
        
        let firstVal = (['A', 'K', 'Q', 'J', '10'].includes(first.v)) ? 10 : (parseInt(first.v) || 0);

        let best = firstVal + solve(remaining.slice(1), jks);

        let sameValue = remaining.filter(c => c.v === first.v);
        for (let size of [3, 4]) {
            for (let n = 1; n <= Math.min(sameValue.length, size); n++) {
                let jNeeded = size - n;
                if (jNeeded <= jks) {
                    let count = 0;
                    let filtered = remaining.filter(c => {
                        if (count < n && c.v === first.v) { count++; return false; }
                        return true;
                    });
                    best = Math.min(best, solve(filtered, jks - jNeeded));
                }
            }
        }

        for (let size of [3, 4, 5]) {
            let currentJks = jks;
            let firstValReal = getVal(first);
            let suit = first.s;
            let tempRemaining = remaining.slice(1);
            let possible = true;

            for (let i = 1; i < size; i++) {
                let target = firstValReal + i;
                let idx = tempRemaining.findIndex(c => getVal(c) === target && c.s === suit);
                if (idx !== -1) {
                    tempRemaining.splice(idx, 1);
                } else if (currentJks > 0) {
                    currentJks--;
                } else {
                    possible = false;
                    break;
                }
            }
            if (possible) {
                best = Math.min(best, solve(tempRemaining, currentJks));
            }
        }

        return best;
    }

    return solve(normalCards, jokers);
}

function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    let idCounter = 1;

    for (let p = 0; p < 2; p++) {
        for (let s of suits) {
            for (let v of values) {
                newDeck.push({ 
                    v: v, 
                    s: s, 
                    id: `c-${idCounter++}`
                });
            }
        }
    }

    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });
    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });

    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }

    console.log(`✅ Deku u krijua me ${newDeck.length} letra.`);
    return newDeck;
}

function startNewRound() {
    console.log("==== Duke nisur raund të ri ZION 71 ====");

    gameDeck = createDeck(); 
    shuffle(gameDeck);
    
    discardPile = []; 
    console.log("Deku u krijua dhe u përzgjodh.");

    const activePlayersCount = players.filter(p => !p.isOut).length;
    if (activePlayersCount <= 1 && players.length > 1) {
        const finalWinner = players.find(p => !p.isOut);
        io.emit('gameOver', { winner: finalWinner?.name || "Askush" });
        console.log("🏆 LOJA PËRFUNDOI! Fituesi kampion:", finalWinner?.name);
        return;
    }

    if (typeof dealerIndex === 'undefined' || dealerIndex === null) dealerIndex = 0;

    let attempts = 0;
    while (players[dealerIndex]?.isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
    }

    players.forEach((player, index) => {
        if (player.isOut) {
            player.cards = [];
            return; 
        }

        player.cards = []; 

        const myJoker = { 
            v: '★', 
            s: 'Joker', 
            id: `joker-${player.id}-${Date.now()}`,
            fixed: true 
        };

        let sasiaNgaDeck = (index === dealerIndex) ? 10 : 9;
        
        let letratNgaDeck = gameDeck.splice(0, sasiaNgaDeck);

        player.cards = [myJoker, ...letratNgaDeck];

        console.log(`DEBUG: ${player.name} - Mori ${player.cards.length} letra.`);
    });

    jackpotCard = gameDeck.pop();
    
    if (jackpotCard) {
        discardPile.push(jackpotCard); 
        console.log("Jackpot-i fillestar (në tokë):", `${jackpotCard.v}${jackpotCard.s}`);
    }

    const playerWith11 = players.find(p => p.cards.length === 11 && !p.isOut);
    
    if (playerWith11) {
        activePlayerIndex = players.indexOf(playerWith11);
        activePlayerId = playerWith11.id;
        
        console.log("👉 Lojtari fillestar:", playerWith11.name);
    }

    players.forEach(p => {
        io.to(p.id).emit('yourCards', p.cards);
    });

    io.emit('updateGameState', {
        activePlayerId: activePlayerId,
        gameStarted: true,
        jackpotCard: jackpotCard,
        discardPile: discardPile,
        players: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history,
            isOut: p.isOut
        }))
    });

    console.log("✅ Serveri sapo dërgoi updateGameState te të gjithë.");
}

io.on('connection', (socket) => {
    console.log("--- Tentativë lidhjeje ---");
    console.log("Socket ID e re:", socket.id);

    socket.on('joinGame', (playerName) => {
        if (gameStarted) {
            socket.emit('errorMsg', 'Loja ka filluar, nuk mund të hysh tani!');
            return;
        }

        const alreadyExists = players.find(p => p.id === socket.id);
        if (alreadyExists) {
            console.log(`Lojtari ${alreadyExists.name} është tashmë në listë.`);
            return;
        }

        if (players.length >= 5) {
            socket.emit('errorMsg', 'Dhoma është e plotë!');
            return;
        }

        const newPlayer = {
            id: socket.id,
            name: playerName || `Lojtar ${players.length + 1}`,
            cards: [],
            score: 0,
            history: [],
            isOut: false
        };

        players.push(newPlayer);
        
        console.log(`✅ U SHTUA: ${newPlayer.name}`);
        console.log(`📊 Totali në dhomë: ${players.length} lojtarë.`);

        io.emit('updateLobbyCount', players.length);
        broadcastState(); 
    });

    socket.on('startGame', () => {
        console.log("--- TENTATIVË STARTI ---");
        console.log("Lojtarë në dhomë:", players.length); 

        if (players.length < 1) { 
            console.log("❌ Gabim: Nuk ka lojtarë!");
            socket.emit('errorMsg', "Nuk ka lojtarë të mjaftueshëm!");
            return;
        }

        if (players.length > 5) {
            console.log("❌ Gabim: Shumë lojtarë (mbi 5)");
            socket.emit('errorMsg', "Maksimumi është 5 lojtarë!");
            return;
        }

        try {
            console.log("🚀 Duke thirrur startNewRound()...");
            gameStarted = true;
            
            startNewRound(); 

            console.log("📢 Duke dërguar initGame te të gjithë...");
            io.emit('initGame');
            
            broadcastState(true);
            console.log("✅ Çdo gjë përfundoi me sukses!");

        } catch (error) {
            console.error("❌ GABIM KRITIK GJATË STARTIT:", error.message);
            socket.emit('errorMsg', "Gabim teknik: " + error.message);
        }
    });
   
    socket.on('drawCard', () => {
        const player = players[activePlayerIndex];
        
        if (!player || player.id !== socket.id) return;
        if (player.cards.length !== 10) {
            broadcastState(false); 
            return;
        }

        if (gameDeck && gameDeck.length > 0) {
            const drawnCard = gameDeck.pop();
            player.cards.push(drawnCard);

            console.log(`✅ ${player.name} tërhoqi ${drawnCard.v}${drawnCard.s}.`);

            socket.emit('cardDrawn', drawnCard);
            
            broadcastState(false); 

        } else {
            if (discardPile.length > 1) {
                const lastCard = discardPile.pop();
                gameDeck = [...discardPile];
                discardPile = [lastCard];
                shuffle(gameDeck);
                
                const drawnCard = gameDeck.pop();
                player.cards.push(drawnCard);

                socket.emit('cardDrawn', drawnCard);
                broadcastState(false);
            } else {
                socket.emit('errorMsg', "Nuk ka më letra në deku!");
            }
        }
    });

    socket.on('drawJackpot', () => {
        const player = players[activePlayerIndex];

        if (!player || player.id !== socket.id || player.cards.length !== 10) {
            console.log(`Tentativë e gabuar për Jackpot nga ${player?.name}`);
            socket.emit('errorMsg', "Jackpot merret vetëm si letra e 10-të!");
            return;
        }

        if (!jackpotCard) {
            socket.emit('errorMsg', "Jackpot-i është marrë tashmë!");
            return;
        }

        console.log(`${player.name} mori Jackpot-in: ${jackpotCard.v}${jackpotCard.s}`);

        const drawnJackpot = jackpotCard;
        player.cards.push(drawnJackpot); 
        jackpotCard = null; 

        socket.emit('cardDrawn', drawnJackpot); 

        broadcastState(false);
    });
    
    socket.on('discardCard', (card) => {
        const currentIndex = players.findIndex(p => p.id === socket.id);
        const player = players[currentIndex];

        if (!player || socket.id !== activePlayerId) {
            console.log(`⚠️ Tentativë jashtë radhës nga: ${player?.name || socket.id}`);
            return;
        }

        if (player.cards.length !== 11) { 
            console.log(`⚠️ ${player.name} tentoi të hidhte me ${player.cards.length} letra.`);
            socket.emit('errorMsg', "Duhet të kesh 11 letra për të hedhur.");
            broadcastState(true); 
            return;
        }

        if (card.v === '★' || card.v === 'Xhoker' || card.s === 'Joker') {
            socket.emit('errorMsg', "Xhokeri nuk mund të hidhet në tokë!");
            broadcastState(true); 
            return; 
        }

        const cardIndex = player.cards.findIndex(c => {
            if (card.id && c.id) return c.id === card.id;
            return c.v === card.v && c.s === card.s;
        });
        
        if (cardIndex !== -1) {
            const removedCard = player.cards.splice(cardIndex, 1)[0];
            if (typeof discardPile === 'undefined') discardPile = [];
            discardPile.push(removedCard);
            
            console.log(`✅ ${player.name} hodhi ${removedCard.v}${removedCard.s}.`);

            let foundNext = false;
            for (let i = 1; i < players.length; i++) {
                let checkIdx = (currentIndex + i) % players.length;
                if (!players[checkIdx].isOut) {
                    activePlayerIndex = checkIdx;
                    activePlayerId = players[activePlayerIndex].id;
                    foundNext = true;
                    break;
                }
            }
            
            if (!foundNext) {
                activePlayerId = players[currentIndex].id;
            }

            console.log(`➡️ Radha kaloi te: ${players[activePlayerIndex].name}`);

            broadcastState(false);

        } else {
            console.log(`❌ Letra nuk u gjet te ${player.name}`);
            broadcastState(true);
        }
    });

    socket.on('declareZion', (data) => {
        const winner = players.find(p => p.id === socket.id);
        console.log("Tentativë mbylljeje nga:", winner?.name);
        console.log("Letrat e lojtarit në server:", winner?.cards.length);
        
        if (!winner || winner.id !== players[activePlayerIndex].id || winner.cards.length !== 11) {
            console.log(`⚠️ Tentativë e pavlefshme nga ${winner?.name}`);
            socket.emit('errorMsg', "Nuk mund të mbyllësh lojën! Kontrollo radhën ose numrin e letrave.");
            return;
        }

        let isHandValid = false;
        let closingCard = null;

        for (let i = 0; i < winner.cards.length; i++) {
            const testHand = [...winner.cards];
            const removed = testHand.splice(i, 1)[0];

            if (['★', 'Xhoker', 'Joker'].includes(removed.v)) continue;

            if (isDoraValid(testHand)) {
                isHandValid = true;
                closingCard = removed; 
                winner.cards.splice(i, 1);
                break;
            }
        }

        if (!isHandValid) {
            console.log(`❌ ${winner.name} tentoi të mbyllet me letra të parregullta!`);
            socket.emit('errorMsg', "Kombinim i pavlefshëm! Letrat nuk janë të grupuara saktë.");
            return;
        }

        if (closingCard) discardPile.push(closingCard);

        const isJackpotWin = data.isJackpotClosing || false;
        console.log(`🏆 ZION! ${winner.name} fiton! (Jackpot: ${isJackpotWin})`);

        players.forEach(p => {
            if (p.isOut) return;
            if (p.id !== winner.id) {
                let roundPoints = calculateScore(p.cards); 
                if (isJackpotWin) roundPoints *= 2;
                p.score += roundPoints;
                p.history.push(isJackpotWin ? `${roundPoints}!` : roundPoints);
                if (p.score >= 71) p.isOut = true;
            } else {
                p.history.push("X");
            }
        });

        io.emit('roundOver', {
            winnerName: winner.name,
            winnerId: winner.id,
            isJackpot: isJackpotWin,
            updatedPlayers: players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                history: p.history,
                isOut: p.isOut
            }))
        });

        io.emit('showWinnerCards', winner.cards);

        dealerIndex = (dealerIndex + 1) % players.length;
        while(players[dealerIndex].isOut) {
            dealerIndex = (dealerIndex + 1) % players.length;
        }
        activePlayerIndex = (dealerIndex + 1) % players.length;

        discardPile = [];   
        jackpotCard = null; 

        const activePlayers = players.filter(p => !p.isOut);
        if (activePlayers.length <= 1) {
            const finalWinner = activePlayers.length === 1 ? activePlayers[0].name : "Askush";
            io.emit('gameOver', { winner: finalWinner });
        } else {
            setTimeout(() => {
                startNewRound(); 
            }, 5000); 
        }
    });

    socket.on('requestWinnerCards', (winnerId) => {
        const winner = players.find(p => p.id === winnerId);
        if (winner) {
            socket.emit('showWinnerCards', winner.cards);
        }
    });

    socket.on('disconnect', () => {
        console.log("❌ Lojtari u shkëput:", socket.id);
        
        players = players.filter(p => p.id !== socket.id);
        
        if (players.length === 0) {
            gameStarted = false; 
            activePlayerId = null;
            discardPile = [];
            console.log("🔄 Dhoma është bosh. Loja u resetua për lojtarët e rinj.");
        }

        io.emit('updateLobbyCount', players.length);
        broadcastState();
    });
});

function broadcastState(shouldSendCards = false) {
    if (players.length === 0) return;

    activePlayerId = players[activePlayerIndex]?.id || null;

    const activePlayersCount = players.filter(p => !p.isOut).length;
    let lobbyMsg = "ZION 71\nNIS LOJËN (START)\n";
    if (!gameStarted) {
        if (activePlayersCount < 2) {
            lobbyMsg += "Prit lojtarët e tjerë të futen...";
        } else {
            lobbyMsg += `${activePlayersCount} lojtarë janë aktivë. Mund të nisni lojën!`;
        }
    }

    io.emit('lobbyMessage', lobbyMsg);

    io.emit('updateGameState', {
        gameStarted: gameStarted,
        players: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history,
            cardCount: p.cards.length,
            isOut: p.isOut
        })),
        activePlayerId: activePlayerId,
        discardPile: discardPile, 
        discardPileTop: discardPile[discardPile.length - 1] || null,
        jackpotCard: jackpotCard
    });

    if (shouldSendCards) {
        players.forEach(p => {
            if (p.id) {
                io.to(p.id).emit('yourCards', p.cards);
            }
        });
        console.log("✅ Letrat private u sinkronizuan me sukses.");
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveri po punon ne porten ${PORT}`);
});
