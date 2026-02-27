const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- GLOBALS ---
let players = [];
let currentTurnIndex = 0;
let deck = [];
let discardPile = [];
let lastWinnerId = null;
let jackpotCard = null;
let gamePhase = "waiting"; // waiting | playing | roundOver
let hasDrawnThisTurn = false;

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    console.log('Një përdorues u lidh:', socket.id);

    // --- 1. JOIN GAME ---
    socket.on('joinGame', (name) => {
        if (gamePhase !== "waiting") {
            socket.emit('error', 'Loja ka nisur.');
            return;
        }

        const existing = players.find(p => p.id === socket.id);
        if (existing) return;

        players.push({
            id: socket.id,
            name: name?.trim() || `Lojtari ${players.length + 1}`,
            score: 0,
            hand: [],
            eliminated: false
        });

        sendGameState();
    });

    // --- 2. REQUEST MY CARDS ---
    socket.on('requestMyCards', () => {
        const player = players.find(p => p.id === socket.id);
        if (!player) return;
        socket.emit('receiveCards', [...player.hand]);
    });

    // --- 3. START GAME ---
    socket.on('startGame', () => {
        if (gamePhase !== "waiting") return;

        const activePlayers = players.filter(p => !p.eliminated);
        if (activePlayers.length < 2) {
            socket.emit('error', 'Duhen të paktën 2 lojtarë.');
            return;
        }

        gamePhase = "playing";
        hasDrawnThisTurn = false;
        deck = createFullDeck();
        discardPile = [];

        let startIndex = 0;
        if (lastWinnerId) {
            let winIdx = players.findIndex(p => p.id === lastWinnerId);
            startIndex = (winIdx !== -1) ? (winIdx + 1) % players.length : 0;
        }

        currentTurnIndex = startIndex;
        while (players[currentTurnIndex]?.eliminated) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
        }

        players.forEach((p, i) => {
            if (!p.eliminated) {
                let count = (i === currentTurnIndex) ? 10 : 9;
                p.hand = deck.splice(0, count);
                p.hand.push({ v: '★', s: 'X' }); // joker
                io.to(p.id).emit('receiveCards', p.hand);
            }
        });

        jackpotCard = deck.pop() || null;

        sendGameState();
    });

    // --- 4. DRAW CARD ---
    socket.on('drawCard', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (hasDrawnThisTurn) return;
        if (deck.length === 0) return;

        const card = deck.pop();
        player.hand.push(card);
        hasDrawnThisTurn = true;
        io.to(socket.id).emit('cardDrawn', card);
        sendGameState();
    });

    // --- 5. DRAW JACKPOT ---
    socket.on('drawJackpot', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (hasDrawnThisTurn) return;
        if (!jackpotCard) return;

        player.hand.push(jackpotCard);
        jackpotCard = null;
        hasDrawnThisTurn = true;
        io.to(socket.id).emit('jackpotDrawn');
        sendGameState();
    });

    // --- 6. CARD DISCARDED ---
    socket.on('cardDiscarded', (card) => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (!hasDrawnThisTurn) return;

        const index = player.hand.findIndex(c => c.v === card.v && c.s === card.s);
        if (index === -1) return;

        const removed = player.hand.splice(index, 1)[0];
        discardPile.push(removed);
        hasDrawnThisTurn = false;

        socket.emit('receiveCards', player.hand);
        sendGameState();
    });

    // --- 7. END TURN ---
    socket.on('endTurn', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;
        if (hasDrawnThisTurn) return;

        moveToNextPlayer();
        sendGameState();
    });

    // --- 8. PLAYER CLOSED ---
    socket.on('playerClosed', () => {
        if (gamePhase !== "playing") return;
        const player = players[currentTurnIndex];
        if (!player || player.id !== socket.id) return;

        if (!verifyHandOnServer(player.hand)) {
            socket.emit('error', 'Dora nuk është e vlefshme.');
            return;
        }

        gamePhase = "roundOver";
        lastWinnerId = socket.id;

        io.emit('roundOver', {
            winnerName: player.name,
            winnerId: socket.id,
            winningHand: player.hand
        });
    });

    // --- 9. CHAT ---
    socket.on('sendMessage', (data) => {
        if (!data?.message?.trim()) return;

        io.emit('receiveMessage', {
            name: players.find(p => p.id === socket.id)?.name || "Anonim",
            message: data.message.slice(0, 200)
        });
    });

    // --- 10. DISCONNECT ---
    socket.on('disconnect', () => {
        const wasActive = players[currentTurnIndex]?.id === socket.id;
        players = players.filter(p => p.id !== socket.id);

        if (players.length === 0) {
            gamePhase = "waiting";
            currentTurnIndex = 0;
            return;
        }

        if (wasActive) {
            hasDrawnThisTurn = false;
            moveToNextPlayer();
        }

        sendGameState();
    });

    // --- HELPERS ---
    function moveToNextPlayer() {
        if (players.length === 0) return;
        currentTurnIndex = (currentTurnIndex + 1) % players.length;
        let attempts = 0;
        while (players[currentTurnIndex]?.eliminated && attempts < players.length) {
            currentTurnIndex = (currentTurnIndex + 1) % players.length;
            attempts++;
        }
    }

    function sendGameState() {
        io.emit('updateGameState', {
            players: players.map(p => ({
                name: p.name,
                id: p.id,
                score: p.score,
                eliminated: p.eliminated
            })),
            activePlayerId: players[currentTurnIndex]?.id,
            deckCount: deck.length,
            jackpotCard: jackpotCard,
            discardPileTop: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null
        });
    }
});

// --- HAND VERIFICATION ---
function verifyHandOnServer(cards) {
    if (!cards || (cards.length !== 10 && cards.length !== 11)) return false;
    const valMap = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
    
    function check10(hand10) {
        let jokers = hand10.filter(c => c.v === '★').length;
        let normalCards = hand10.filter(c => c.v !== '★').map(c => ({ v: valMap[c.v], s: c.s })).sort((a,b)=>a.v-b.v);
        
        function solve(remaining,jLeft){
            if(remaining.length===0) return true;
            let first=remaining[0];
            // Same value sets
            for(let size=3;size<=4;size++){
                let sameVal=remaining.filter(c=>c.v===first.v);
                for(let use=1;use<=Math.min(sameVal.length,size);use++){
                    let jNeeded=size-use;
                    if(jNeeded<=jLeft){
                        let next=[...remaining];
                        for(let i=0;i<use;i++){
                            let idx=next.findIndex(c=>c.v===first.v);
                            next.splice(idx,1);
                        }
                        if(solve(next,jLeft-jNeeded)) return true;
                    }
                }
            }
            // Sequences
            for(let size=3;size<=10;size++){
                let currentJ=jLeft;
                let tempNext=[...remaining];
                let possible=true;
                for(let v=first.v;v<first.v+size;v++){
                    let foundIdx=tempNext.findIndex(c=>c.v===v&&c.s===first.s);
                    if(foundIdx>-1) tempNext.splice(foundIdx,1);
                    else if(currentJ>0) currentJ--;
                    else {possible=false;break;}
                }
                if(possible&&solve(tempNext,currentJ)) return true;
            }
            return false;
        }
        return solve(normalCards,jokers);
    }

    for(let i=0;i<cards.length;i++){
        let test=cards.filter((_,idx)=>idx!==i);
        if(check10(test)) return true;
    }
    return false;
}

function createFullDeck(){
    let d=[];
    const s=['♠','♣','♥','♦'],v=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for(let i=0;i<2;i++){
        s.forEach(sym=>v.forEach(val=>d.push({v:val,s:sym})));
    }
    return d.sort(()=>Math.random()-0.5);
}

// --- START SERVER ---
server.listen(process.env.PORT || 10000, ()=>{
    console.log("Serveri po punon në portin 10000");
});
