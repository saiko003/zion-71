
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
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let gameStarted = false;
let gameDeck = [];
let dealerIndex = 0;
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
    // 1. Krijojmë dhe përziejmë dekun (Përdorim variablën globale gameDeck direkt)
    gameDeck = createDeck(); 
    shuffle(gameDeck);
    discardPile = []; // Pastrojmë letrat në tokë

    // Sigurohemi që DealerIndex ekziston (Përdorim emrin që ke në variablat globale)
    if (typeof currentDealerIndex === 'undefined' || currentDealerIndex === null) {
        currentDealerIndex = 0;
    }

    players.forEach((player, index) => {
        // RESET: Fshijmë letrat e vjetra para se të japim të rejat
        player.cards = []; 

        // 2. KRIJOJME XHOKERIN (VETËM 1 për çdo lojtar)
        const myJoker = { v: '★', s: 'Xhoker' };

        // 3. SHPËRNDARJA: Dealer-i (ai që ka radhën) merr 10 nga deku, tjetri 9
        let sasiaNgaDeck = (index === currentDealerIndex) ? 10 : 9;
        
        // Marrim letrat nga gameDeck
        let letratNgaDeck = gameDeck.splice(0, sasiaNgaDeck);

        // 4. BASHKIMI: Xhokeri + letrat e deçkës (Garanton 11 për Dealer, 10 për të tjerët)
        player.cards = [myJoker, ...letratNgaDeck];

        console.log(`DEBUG: ${player.name} (Index: ${index}) - Mori: ${player.cards.length} letra.`);
    });

    // 5. JACKPOT: Letra e parë që mbetet në deçkë
    jackpotCard = gameDeck.pop();
    
    // 6. KUSH E KA RADHËN? Ai që ka 11 letra (Dealer-i aktual)
    activePlayerIndex = dealerIndex
    if (players[activePlayerIndex]) {
        activePlayerId = players[activePlayerIndex].id;
    }

    // KUJDES: Rotacioni (currentDealerIndex = ...) 
    // DUHET të bëhet te funksioni 'playerClosed' (kur mbaron raundi), 
    // JO këtu, sepse i ngatërron radhët e shpërndarjes tani.

    broadcastState(); 
}
// ==========================================
// 2. KOMUNIKIMI ME LOJTARËT
// ==========================================
io.on('connection', (socket) => {
    console.log("Lojtar i ri u lidh:", socket.id);

    // KORRIGJUAR: socket (jo ssocket)
    socket.on('joinGame', (playerName) => {
    // 1. KONTROLLI: Mos lejo hyrjen nëse loja ka nisur (për siguri)
    if (gameStarted) {
        socket.emit('errorMsg', 'Loja ka filluar, nuk mund të hysh tani!');
        return;
    }

    // 2. KONTROLLI: Maksimumi 5 lojtarë
    if (players.length >= 5) {
        socket.emit('errorMsg', 'Dhoma është e plotë (Maksimumi 5 lojtarë)!');
        console.log(`Tentativë refuzuar: ${playerName} - Dhoma plot.`);
        return;
    }

    // 3. KRIJIMI I LOJTARIT (Kodi yt origjinal i ruajtur plotësisht)
    const newPlayer = {
        id: socket.id,
        name: playerName || "Lojtar i panjohur",
        cards: [],
        score: 0,
        history: [],
        isOut: false
    };
        
    players.push(newPlayer);
    console.log(`${newPlayer.name} u shtua në lojë. Totali: ${players.length}`);
    
    // 4. NJOFTIMI I TË GJITHËVE
    broadcastState(); 
});

   
socket.on('startGame', () => {
    // 1. KONTROLLI I MINIMUMIT (Të paktën 2)
    if (players.length < 2) {
        socket.emit('errorMsg', "Duhen të paktën 2 lojtarë për të nisur!");
        console.log("Nuk ka mjaftueshëm lojtarë.");
        return; 
    }

    // 2. KONTROLLI I MAKSIMUMIT (Për siguri, nëse s'e kapi joinGame)
    if (players.length > 5) {
        socket.emit('errorMsg', "Maksimumi është 5 lojtarë!");
        return;
    }

    console.log("Loja po nis...");

    // 3. Markojmë që loja nisi (Kjo bllokon hyrjen e të tjerëve te joinGame)
    gameStarted = true;

    // 4. Kush e nis i pari (Raundi i parë)
    dealerIndex = 0; 

    // 5. Thërrasim funksionin që ndan Xhokerat dhe letrat (ZEMRA)
    startNewRound(); 
    
    // Shënim: Nuk kemi nevojë për broadcastState() këtu sepse 
    // e thërret startNewRound() automatikisht.
});
    // TËRHEQJA E LETRËS (Pika 12)
    socket.on('drawCard', () => {
    const player = players[activePlayerIndex];
    
    // 1. Kontrolli i radhës dhe i numrit të letrave (duhet të ketë saktësisht 10 për të tërhequr)
    if (!player || player.id !== socket.id || player.cards.length !== 10) return;

    // 2. Sigurohemi që deçka (deck) nuk është bosh
    if (gameDeck && gameDeck.length > 0){
        const drawnCard = gameDeck.pop(); // Marrim letrën e fundit
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

    // 1. KONTROLLI I RADHËS DHE SASISË (Kritike!)
    // Lojtari mund të hedhë letër VETËM nëse është radha e tij dhe ka 11 letra.
    if (!player || player.id !== socket.id || player.cards.length !== 11) {
        console.log(`Tentativë e pavlefshme nga ${player?.name}. Letra në dorë: ${player?.cards.length}`);
        return;
    }

    // 2. MBROJTJA E XHOKERIT (★)
    // Sigurohemi që nuk po hedh yllin që i dhamë në fillim.
    if (card.v === '★' || card.v === 'Xhoker') {
        console.log("Xhokeri nuk lejohet të hidhet në tokë!");
        return; 
    }

    // 3. GJETJA DHE HEQJA E LETRËS
    const cardIndex = player.cards.findIndex(c => c.v === card.v && c.s === card.s);
    
    if (cardIndex !== -1) {
        // Heqim letrën nga dora e lojtarit
        const removedCard = player.cards.splice(cardIndex, 1)[0];
        
        // E vendosim në majë të stivës në tokë
        discardPile.push(removedCard);
        
        // 4. KALIMI I RADHËS TE LOJTARI TJETËR
        // Përdorim modulo (%) që radha të kthehet te lojtari i parë pasi të luajë i fundit.
        activePlayerIndex = (activePlayerIndex + 1) % players.length;
        
        console.log(`${player.name} hodhi ${card.v}${card.s}. Radhën e ka lojtari tjetër.`);

        // 5. NJOFTIMI I TË GJITHËVE
        broadcastState();
    }
});
    // MBYLLJA (ZION!)
socket.on('playerClosed', (data) => {
    const winner = players.find(p => p.id === socket.id);
    if (!winner) return;

    console.log(`${winner.name} ka bërë ZION!`);

    // 1. Llogarit pikët e të gjithë lojtarëve
    players.forEach(p => {
        if (p.id !== winner.id) {
            // Llogarisim pikët bazuar në letrat që i kanë mbetur në dorë
            let roundPoints = calculateScore(p.cards); 
            p.score += roundPoints;
            p.history.push(roundPoints);
        } else {
            // Fituesi shënohet me "X" në histori
            p.history.push("X"); 
        }
    });

    // 2. Dërgojmë sinjalin te të gjithë që raundi mbaroi (për të shfaqur tabelën)
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

    // 3. NDRYSHIMI I DEALER-IT (Stafeta kalon te lojtari tjetër)
    dealerIndex = (dealerIndex + 1) % players.length;

    // 4. FILLIMI I RAUNDIT TË RI (Me vonesë 3 sekonda)
    // Kjo u jep kohë lojtarëve të shohin kush fitoi para se të vijnë letrat e reja
    setTimeout(() => {
        console.log("Duke nisur raundin e ri...");
        startNewRound();
    }, 3000); 
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
    // 1. NJOFTIMI GJERË (Për të gjithë: Kush e ka radhën, çfarë ka në tokë)
    io.emit('updateGameState', {
        players: players.map(p => ({ 
            id: p.id, 
            name: p.name, 
            score: p.score, 
            history: p.history,
            cardCount: p.cards.length // E dërgojmë sa letra kanë (pa treguar cilat janë)
        })),
        activePlayerId: players[activePlayerIndex]?.id,
        discardPileTop: discardPile[discardPile.length - 1],
        jackpotCard: jackpotCard
    });

    // 2. NJOFTIMI PRIVAT (Kritike për Xhokerin!)
    // Dërgojmë letrat specifike te secili lojtar në kanalin e tij "yourCards"
    players.forEach(player => {
        io.to(player.id).emit('yourCards', player.cards);
    });
}
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
