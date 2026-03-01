const express = require('express');
const http = require('http');
const { Server } = require('socket.io'); // MBAJE KËTË
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// KËTU bëhet bashkimi - Përdorim { Server } që importuam sipër
const io = new Server(server, {
    cors: {
        origin: [
            "https://zion-71.onrender.com", 
            "http://127.0.0.1:5500",        
            "http://localhost:5500"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Vazhdon kodi tjetër...

// ==========================================
// 1. VARIABLAT E LOJËS (Pika 1, 2)
// ==========================================
let activePlayerId = null; 
let deck = [];
let discardPile = [];
let jackpotCard = null;
let activePlayerIndex = 0;
let gameStarted = false;
let gameDeck = [];
let players = [];
let dealerIndex = 0;
function endRound(winnerId) {
    console.log("==== Përfundimi i Raundit ====");

    // 1️⃣ Llogaritja e pikëve (Kodi yt origjinal i paprekur)
    players.forEach(player => {
        if (player.id === winnerId) {
            // Fituesi (ai që bëri ZION)
            player.score += 0; 
            player.history.push('X');
        } else {
            // HUMBËSIT: Llogarit pikët e letrave që nuk janë lidhur në grupe
            let penalty = calculateScore(player.cards); 
            
            player.score += penalty;
            player.history.push(penalty);
        }
        
        // Rregulli i eliminimit në 71
        if (player.score >= 71) {
            player.isOut = true;
        }
    });

    // 2️⃣ Kontrolli i fituesit final (GameOver)
    const activePlayers = players.filter(p => !p.isOut);

    if (activePlayers.length === 1) {
        console.log("LOJA PËRFUNDOI! Fituesi:", activePlayers[0].name);
        io.emit('gameOver', { winner: activePlayers[0].name });
        return; // Ndal ekzekutimin, nuk ka më raunde
    } else if (activePlayers.length === 0) {
        // Rast i rrallë barazimi (të gjithë mbi 71)
        io.emit('gameOver', { winner: "Barazim (Të gjithë u eliminuan)" });
        return;
    }

    // 3️⃣ Rrotullimi i Dealer-it (Kodi yt origjinal)
    dealerIndex = (dealerIndex + 1) % players.length;
    let attempts = 0;
    while(players[dealerIndex].isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
    }

    // 4️⃣ NISJA E RAUNDIT TË RI
    // I japim lojtarëve 5 sekonda kohë të shohin rezultatet në tabelë para se të fshihen letrat
    console.log("Raundi tjetër nis pas 5 sekondave...");
    setTimeout(() => {
        startNewRound(); 
    }, 5000);
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
    console.log("==== Duke nisur raund të ri ZION 71 ====");

    // 1️⃣ Krijojmë dhe përziejmë dekun
    gameDeck = createDeck(); 
    shuffle(gameDeck);
    
    // RREGULLIM: Pastrojmë stivën vizuale (discardPile) në fillim të raundit
    discardPile = []; 
    console.log("Deku u krijua dhe u përzgjodh.");

    // 2️⃣ Kontroll i dealerIndex dhe siguro që është tek një lojtar aktiv
    if (typeof dealerIndex === 'undefined' || dealerIndex === null) dealerIndex = 0;

    let attempts = 0;
    while (players[dealerIndex]?.isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
    }

    // 3️⃣ Shpërndarja e letrave te lojtarët aktivë
    players.forEach((player, index) => {
        if (player.isOut) {
            player.cards = [];
            return; 
        }

        // RESET letrat e vjetra
        player.cards = []; 

        // Xhokeri (Ylli i Zionit)
        const myJoker = { v: '★', s: 'Xhoker' };

        // Rregulli: Dealer merr 10 nga deck (+1 xhoker = 11), të tjerët 9 (+1 xhoker = 10)
        let sasiaNgaDeck = (index === dealerIndex) ? 10 : 9;
        let letratNgaDeck = gameDeck.splice(0, sasiaNgaDeck);

        // Bashkim i letrave
        player.cards = [myJoker, ...letratNgaDeck];

        console.log(`DEBUG: ${player.name} - Mori ${player.cards.length} letra.`);
    });

    // 4️⃣ Jackpot & Stiva Fillestare
    // Marrim letrën e parë që mbetet në deku pas shpërndarjes
    jackpotCard = gameDeck.pop();
    
    // UPDATE: E shtojmë këtë letër edhe te discardPile që të jetë vizuale në tokë
    if (jackpotCard) {
        discardPile.push(jackpotCard); 
        console.log("Jackpot-i fillestar (në tokë):", `${jackpotCard.v}${jackpotCard.s}`);
    }

    // 5️⃣ Vendosim lojtarin aktiv (Dealer-i)
    activePlayerIndex = dealerIndex;

    attempts = 0;
    while (players[activePlayerIndex]?.isOut && attempts < players.length) {
        activePlayerIndex = (activePlayerIndex + 1) % players.length;
        attempts++;
    }

    if (!players[activePlayerIndex]) {
        console.warn("Nuk u gjet lojtari aktiv!");
        activePlayerIndex = 0;
    }
    
    activePlayerId = players[activePlayerIndex]?.id || null;
    console.log("Lojtari aktiv (Dealer):", players[activePlayerIndex]?.name);

    // 6️⃣ Broadcast gjendja (Tani përfshin edhe discardPile me letrën e parë)
    broadcastState();

    console.log("Raundi i ri është gati, gjendja u dërgua.");
}
// ==========================================
// 2. KOMUNIKIMI ME LOJTARËT
// ==========================================
io.on('connection', (socket) => {
    console.log("--- Tentativë lidhjeje ---");
    console.log("Socket ID e re:", socket.id);

    socket.on('joinGame', (playerName) => {
        // 1. KONTROLLI I STATUSIT TË LOJËS
        if (gameStarted) {
            socket.emit('errorMsg', 'Loja ka filluar, nuk mund të hysh tani!');
            return;
        }

        // 2. KONTROLLI I DUPLIKIMIT (Mos e shto nëse ID ekziston në listë)
        const alreadyExists = players.find(p => p.id === socket.id);
        if (alreadyExists) {
            console.log(`Lojtari ${alreadyExists.name} është tashmë në listë.`);
            return;
        }

        // 3. KONTROLLI I LIMITIT (Maksimumi 5)
        if (players.length >= 5) {
            socket.emit('errorMsg', 'Dhoma është e plotë!');
            return;
        }

        // 4. KRIJIMI I LOJTARIT
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

        // 5. NJOFTIMI I TË GJITHËVE
        io.emit('updateLobbyCount', players.length);
        broadcastState(); 
    });

socket.on('startGame', () => {
    console.log("--- TENTATIVË STARTI ---");
    console.log("Lojtarë në dhomë:", players.length); 

    // 1. Kontrollet e sigurisë
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
        
        // Ky funksion duhet të jetë i definuar diku në server.js
        startNewRound(); 

        console.log("📢 Duke dërguar initGame te të gjithë...");
        io.emit('initGame');
        
        broadcastState();
        console.log("✅ Çdo gjë përfundoi me sukses!");

    } catch (error) {
        console.error("❌ GABIM KRITIK GJATË STARTIT:", error.message);
        socket.emit('errorMsg', "Gabim teknik: " + error.message);
    }
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
        
        do {
            activePlayerIndex = (activePlayerIndex + 1) % players.length;
        } while (players[activePlayerIndex].isOut);
        
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
    console.log("❌ Lojtari u shkëput:", socket.id);
    
    // 1. Hiq lojtarin nga lista
    players = players.filter(p => p.id !== socket.id);
    
    // 2. NESE DHOMA MBETET BOSH, RESETO STATUSIN E LOJES
    if (players.length === 0) {
        gameStarted = false; 
        activePlayerId = null;
        discardPile = [];
        console.log("🔄 Dhoma është bosh. Loja u resetua për lojtarët e rinj.");
    }

    // 3. Njofto të tjerët (nëse ka mbetur dikush)
    io.emit('updateLobbyCount', players.length);
    broadcastState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveri po punon në portën ${PORT}`));

// server.js

// Ky funksion do të përdoret kur dikush thërret "ZION"
function calculateScore(cards) {
    let score = 0;
    if (!cards || cards.length === 0) return 0;

    cards.forEach(card => {
        // 1. Xhokeri nuk shton asgjë (0 pikë)
        if (card.v === '★' || card.v === 'Xhoker') {
            score += 0; 
        } 
        // 2. Letrat e rënda vlejnë 10
        else if (['A', 'K', 'Q', 'J', '10'].includes(card.v)) {
            score += 10;
        } 
        // 3. Letrat 2-9 vlejnë sa numri
        else {
            let val = parseInt(card.v);
            if (!isNaN(val)) score += val;
        }
    });
    return score;
}
function broadcastState() {
    if (players.length === 0) return;

    // 1. SINKRONIZIMI I ID-së (E rëndësishme që drita e radhës të ndizet saktë)
    activePlayerId = players[activePlayerIndex]?.id || null;

    console.log("Statusi i lojës që po dërgohet:", gameStarted);
    console.log("DEBUG: activePlayerIndex =", activePlayerIndex, "Players length =", players.length);

    // 2. Përgatitja e mesazhit të Lobby
    const activePlayersCount = players.filter(p => !p.isOut).length;
    let lobbyMsg = "ZION 71\nNIS LOJËN (START)\n";
    if (!gameStarted) {
        if (activePlayersCount < 2) {
            lobbyMsg += "Prit lojtarët e tjerë të futen...";
        } else {
            lobbyMsg += `${activePlayersCount} lojtarë janë aktivë. Mund të nisni lojën!`;
        }
    }

    // 3. Dërgimi i eventeve
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
        activePlayerId: activePlayerId, // Përdorim variablin e sinkronizuar sipër
        
        // Dërgojmë të gjithë listën e letrave në tokë që të shihet historia
        discardPile: discardPile, 
        
        // Letra e fundit për qasje të shpejtë
        discardPileTop: discardPile[discardPile.length - 1] || null,
        
        jackpotCard: jackpotCard
    });

    // 4. Letrat individuale për secilin lojtar
    players.forEach(player => {
        io.to(player.id).emit('yourCards', player.cards);
    });
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
