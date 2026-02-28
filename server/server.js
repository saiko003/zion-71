
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
let activePlayerId = null; 
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let gameStarted = false;
let gameDeck = [];
let players = [];
let dealerIndex = 0;
function endRound(winnerId) {
    // Përdorim direkt listën 'players' që kemi në server
    players.forEach(player => {
        if (player.id === winnerId) {
            // Fituesi (ai që bëri ZION)
            player.score += 0; 
            player.history.push('X');
        } else {
            // HUMBËSIT: Llogarit pikët e letrave që nuk janë lidhur në grupe
            // Funksioni calculateScore që kemi më poshtë i mbledh këto vlera
            let penalty = calculateScore(player.cards); 
            
            player.score += penalty;
            player.history.push(penalty);
        }
        
        // Rregulli i eliminimit në 71
        if (player.score >= 71) {
            player.isOut = true;
        }
    });

    // Rrotullimi i Dealer-it (shmang lojtarët e eliminuar)
    dealerIndex = (dealerIndex + 1) % players.length;
    let attempts = 0;
    while(players[dealerIndex].isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
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
    // 1. Krijojmë dhe përziejmë dekun
    gameDeck = createDeck(); 
    shuffle(gameDeck);
    discardPile = []; // Pastrojmë letrat në tokë

    // KORRIGJIM: Përdorim 'dealerIndex' që e ke deklaruar në fillim të serverit
    // Nëse nuk është caktuar asnjëherë, e nisim nga 0
    if (typeof dealerIndex === 'undefined' || dealerIndex === null) {
        dealerIndex = 0;
    }

    players.forEach((player, index) => {
        // RESET: Fshijmë letrat e vjetra
        player.cards = []; 

        // 2. KRIJOJMË XHOKERIN (1 për çdo lojtar)
        const myJoker = { v: '★', s: 'Xhoker' };

        // 3. SHPËRNDARJA: Dealer-i merr 10 nga deku, të tjerët 9
        // Kujdes: Këtu përdorim dealerIndex për krahasim
        let sasiaNgaDeck = (index === dealerIndex) ? 10 : 9;
        
        // Marrim letrat nga gameDeck
        let letratNgaDeck = gameDeck.splice(0, sasiaNgaDeck);

        // 4. BASHKIMI: Xhokeri + letrat e deçkës
        player.cards = [myJoker, ...letratNgaDeck];

        console.log(`DEBUG: ${player.name} (Index: ${index}) - Mori: ${player.cards.length} letra.`);
    });

    // 5. JACKPOT: Letra e parë që mbetet në deçkë
    jackpotCard = gameDeck.pop();
    
    // 6. KUSH E KA RADHËN? Ai që ka 11 letra (Dealer-i aktual)
    activePlayerIndex = dealerIndex; 
    
    if (players[activePlayerIndex]) {
        // Përditësojmë ID-në e lojtarit aktiv për komunikim me frontendin
        activePlayerId = players[activePlayerIndex].id;
    }

    // Njoftojmë të gjithë lojtarët për gjendjen e re
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

  socket.on('drawJackpot', () => {
    const player = players[activePlayerIndex];

    // 1. KONTROLLI I RADHËS DHE SASISË
    // Mund ta marrësh Jackpot-in vetëm nëse është radha jote dhe ke 10 letra
    if (!player || player.id !== socket.id || player.cards.length !== 10) {
        console.log(`Tentativë e gabuar për Jackpot nga ${player?.name}`);
        return;
    }

    // 2. KONTROLLI NËSE KA JACKPOT
    if (!jackpotCard) {
        socket.emit('errorMsg', "Jackpot-i është marrë tashmë!");
        return;
    }

    console.log(`${player.name} mori Jackpot-in: ${jackpotCard.v}${jackpotCard.s}`);

    // 3. TRANSFERIMI I LETRËS
    player.cards.push(jackpotCard); // Lojtari bëhet me 11 letra
    jackpotCard = null; // Jackpot-i fshihet nga tavolina

    // 4. NJOFTIMI
    // Nuk e kalojmë radhën automatikisht, sepse lojtari tani duhet ose 
    // të bëjë "ZION" (mbyllje) ose të hedhë një letër tjetër në tokë.
    broadcastState();
});
    
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

    // --- RREGULLI I RI I DYFISHIMIT ---
    // Kontrollojmë nëse mbyllja është bërë me Jackpot (vjen nga frontend-i)
    const isJackpotWin = data.isJackpotClosing || false;

    console.log(`${winner.name} kërkoi mbylljen e raundit. Jackpot Win: ${isJackpotWin}`);

    // 1. Llogarit pikët për të gjithë
    players.forEach(p => {
        if (p.id !== winner.id) {
            // Humbësit llogarisin letrat që u kanë mbetur në dorë
            let roundPoints = calculateScore(p.cards); 
            
            // SHUMËZIMI: Nëse është mbyllje me Jackpot, pikët bëhen x2
            if (isJackpotWin) {
                roundPoints = roundPoints * 2;
            }

            p.score += roundPoints;
            
            // Në histori shtojmë një shenjë (p.sh. "!") që të dihet kur janë dyfishuar
            p.history.push(isJackpotWin ? `${roundPoints}!` : roundPoints);
            
            // Kontrollojmë nëse lojtari është eliminuar (>= 71)
            if (p.score >= 71) p.isOut = true;
        } else {
            // Fituesi shënohet me "X"
            p.history.push("X"); 
        }
    });

    // 2. Njoftojmë të gjithë për rezultatet (Shtojmë edhe 'isJackpot' te njoftimi)
    io.emit('roundOver', {
        winnerName: winner.name,
        isJackpot: isJackpotWin,
        updatedPlayers: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history,
            isOut: p.score >= 71 
        }))
    });

    // 3. NDRYSHIMI I DEALER-IT (Rotacioni)
    dealerIndex = (dealerIndex + 1) % players.length;
    
    let attempts = 0;
    while(players[dealerIndex].isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
    }

    // 4. PASTRIMI I TAVOLINËS
    jackpotCard = null; 
    discardPile = [];   

    // 5. FILLIMI I RAUNDIT TË RI (Pas 3 sekondave)
    setTimeout(() => {
        console.log("Duke nisur raundin e ri me Dealer-in e ri...");
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
        // 1. Xhokeri (Ylli) vlen 0 pikë (nuk dënohesh)
        if (card.v === '★' || card.v === 'Xhoker') return;

        // 2. Letrat e rënda (A, K, Q, J, 10) vlejnë nga 10 pikë secila
        if (['A', 'K', 'Q', 'J', '10'].includes(card.v)) {
            score += 10;
        } else {
            // 3. Letrat e tjera (2-9) vlejnë sa numri i tyre
            let val = parseInt(card.v);
            if (!isNaN(val)) score += val;
        }
    });
    return score;
}
function broadcastState() {
    io.emit('updateGameState', {
        gameStarted: gameStarted,
        players: players.map(p => ({ 
            id: p.id, 
            name: p.name, 
            score: p.score, 
            history: p.history,
            isOut: p.isOut,
            cardCount: p.cards.length 
        })),
        activePlayerId: players[activePlayerIndex]?.id,
        discardPileTop: discardPile[discardPile.length - 1] || null,
        jackpotCard: jackpotCard
    }); // Kjo mbyll io.emit

    // Dërgojmë letrat private te secili lojtar
    players.forEach(player => {
        io.to(player.id).emit('yourCards', player.cards);
    });
} // Kjo mbyll funksionin broadcastState

// Funksioni profesional për përzierjen e letrave
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
