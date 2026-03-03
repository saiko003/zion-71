const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// --- KORRIGJIMI I RRUGËS PËR RENDER ---
// Duke qenë se server.js është brenda folderit /server, 
// duhet të dalim një nivel lart (..) dhe të hyjmë te /client
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


// Shto një log të thjeshtë për të parë nëse dikush lidhet
io.on('connection', (socket) => {
    console.log('Një lojtar u lidh:', socket.id);
});


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
const cardOrder = {
    'A': 14,
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13
};

// 2. SHTO KËTU: Funksioni që kontrollon vargjet (Policia e lojës)
function isSequence(cards) {
    if (cards.length < 3) return false;

    // Kontrollojmë nëse janë të gjitha të njëjtës shenjë (psh. ♥)
    const suit = cards[0].s;
    if (!cards.every(c => c.s === suit)) return false;

    // Prova 1: A-ja si 1 (A-2-3)
    const valuesLow = cards.map(c => (c.v === 'A' ? 1 : cardOrder[c.v])).sort((a, b) => a - b);
    const isLow = valuesLow.every((v, i) => i === 0 || v === valuesLow[i - 1] + 1);

    // Prova 2: A-ja si 14 (10-J-Q-K-A)
    const valuesHigh = cards.map(c => (c.v === 'A' ? 14 : cardOrder[c.v])).sort((a, b) => a - b);
    const isHigh = valuesHigh.every((v, i) => i === 0 || v === valuesHigh[i - 1] + 1);

    // Kthehet True vetëm nëse është njëra nga këto dyja
    // Nëse vargu është Q-K-A-2, të dyja do dalin false (RREGULLI YT)
    return isLow || isHigh;
}
function isSet(cards) {
    if (cards.length < 3) return false;
    const firstValue = cards[0].v;
    // Të gjitha duhet të kenë vlerën e njëjtë (psh. '7')
    if (!cards.every(c => c.v === firstValue)) return false;
    
    // Duhet të kenë shenja të ndryshme (nuk lejohen dy 7-sha rrush në një grup)
    const suits = cards.map(c => c.s);
    return new Set(suits).size === cards.length;
}
function endRound(winnerId) {
    console.log("==== Përfundimi i Raundit ====");

    // 1. Llogaritja e pikëve
    players.forEach(player => {
        if (player.id === winnerId) {
            player.history.push('X');
        } else {
            let penalty = calculateScore(player.cards); 
            player.score += penalty;
            player.history.push(penalty);
        }
        
        if (player.score >= 71) {
            player.isOut = true;
        }
    });

    const activePlayers = players.filter(p => !p.isOut);

    // 2. Njoftojmë Front-end-in (Ky rresht duhet patjetër!)
    io.emit('roundOver', {
        winnerName: players.find(p => p.id === winnerId)?.name || "Dikush",
        updatedPlayers: players,
        isGameOver: activePlayers.length <= 1
    });

    // 3. Kontrolli i GameOver
    if (activePlayers.length <= 1) {
        const finalWinner = activePlayers.length === 1 ? activePlayers[0].name : "Barazim";
        console.log("LOJA PËRFUNDOI! Fituesi:", finalWinner);
        io.emit('gameOver', { winner: finalWinner });
        gameStarted = false; // Ndalojmë lojën
        return; 
    }

    // 4. Rrotullimi i Dealer-it
    dealerIndex = (dealerIndex + 1) % players.length;
    let attempts = 0;
    while(players[dealerIndex].isOut && attempts < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        attempts++;
    }

    // 5. NISJA E RAUNDIT TË RI
    console.log("Raundi tjetër nis pas 5 sekondave...");
    setTimeout(() => {
        // Sigurohu që startNewRound i zbraz letrat në tokë (discardPile = [])
        startNewRound(); 
    }, 5000);
}
function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    let idCounter = 1; 

    // 1. Krijojmë 104 letrat (2 pako x 52)
    for (let p = 0; p < 2; p++) {
        for (let s of suits) {
            for (let v of values) {
                newDeck.push({ 
                    v: v, 
                    s: s, 
                    id: `c-${idCounter++}` // Krijon ID unike nga c-1 deri c-104
                });
            }
        }
    }

    // 2. XHOKERËT (Nëse i do, thjesht hiqni // më poshtë)
    // Duke i lënë këtu jashtë ciklit, shtohen vetëm 2 ID-të e radhës (c-105, c-106)
    /*
    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });
    newDeck.push({ v: '★', s: 'Joker', id: `c-${idCounter++}` });
    */

    // 3. Përzierja (Fisher-Yates Shuffle)
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }

    console.log(`✅ Deku u krijua me ${newDeck.length} letra.`);
    return newDeck;
}
function startNewRound() {
    console.log("==== Duke nisur raund të ri ZION 71 ====");

    // 1️⃣ Krijojmë dhe përziejmë dekun
    gameDeck = createDeck(); 
    shuffle(gameDeck);
    
    discardPile = []; 
    console.log("Deku u krijua dhe u përzgjodh.");

    // Kontrolli nëse ka mbetur vetëm një lojtar aktiv (Fituesi i lojës)
    const activePlayersCount = players.filter(p => !p.isOut).length;
    if (activePlayersCount <= 1 && players.length > 1) {
        const finalWinner = players.find(p => !p.isOut);
        io.emit('gameOver', { winner: finalWinner?.name || "Askush" });
        console.log("🏆 LOJA PËRFUNDOI! Fituesi kampion:", finalWinner?.name);
        return; // Ndalojmë raundin e ri nëse kemi kampionin final
    }

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

        player.cards = []; 

        // Xhokeri (Ylli i Zionit) me ID unike që të mos bllokohet kodi
        const myJoker = { 
            v: '★', 
            s: 'Jokeri', 
            id: `joker-${player.id}-${Date.now()}`, // ID unike për këtë lojtar
            fixed: true 
        };

        // Rregulli yt: Dealer 10 nga deck, të tjerët 9
        let sasiaNgaDeck = (index === dealerIndex) ? 10 : 9;
        
        // Sigurohemi që marrim letrat me ID-të e tyre unike nga createDeck i ri
        let letratNgaDeck = gameDeck.splice(0, sasiaNgaDeck);

        // Bashkimi: Xhokeri + letrat normale
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

// 5️⃣ VENDOSIM LOJTARIN AKTIV (Ai që ka 11 letra)
    const playerWith11 = players.find(p => p.cards.length === 11 && !p.isOut);
    
    if (playerWith11) {
        activePlayerIndex = players.indexOf(playerWith11);
        activePlayerId = playerWith11.id; // Sigurohu që kjo variabël është globale në server.js
        
        console.log("👉 Lojtari fillestar:", playerWith11.name);
    }

    // 6️⃣ NJOFTIMI FINAL (Shumë i rëndësishëm)
    // Dërgojmë letrat private
    players.forEach(p => {
        io.to(p.id).emit('yourCards', p.cards);
    });

    // Dërgojmë gjendjen e lojës (kush e ka radhën) te të gjithë
    io.emit('updateGameState', {
        activePlayerId: activePlayerId,
        gameStarted: true,
        jackpotCard: jackpotCard,
        discardPile: discardPile
    });

    console.log("✅ Serveri sapo dërgoi updateGameState te të gjithë.");
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
        
        broadcastState(true);
        console.log("✅ Çdo gjë përfundoi me sukses!");

    } catch (error) {
        console.error("❌ GABIM KRITIK GJATË STARTIT:", error.message);
        socket.emit('errorMsg', "Gabim teknik: " + error.message);
    }
});
   
    
    // TËRHEQJA E LETRËS (Pika 12)
socket.on('drawCard', () => {
    const player = players[activePlayerIndex];
    
    if (!player || player.id !== socket.id) {
        console.log(`⚠️ Jo radha e ${player?.name || 'panjohur'}`);
        return; 
    }

    if (player.cards.length !== 10) {
        console.log(`⚠️ ${player.name} ka ${player.cards.length} letra. Nuk mund të tërheqësh!`);
        broadcastState(false); 
        return;
    }

    if (gameDeck && gameDeck.length > 0) {
        const drawnCard = gameDeck.pop();
        player.cards.push(drawnCard);

        console.log(`✅ ${player.name} tërhoqi ${drawnCard.v}${drawnCard.s}.`);

        // 1. Njoftojmë lojtarin që të nisë animacionin në ekranin e tij
        socket.emit('cardDrawn', drawnCard);
        
        // 2. I dërgojmë vetëm lojtarit dorën e re të përditësuar
        socket.emit('yourCards', player.cards);
        
        // 3. Njoftojmë të tjerët që ky lojtar tani ka 11 letra (pa u dërguar letrat tona)
        broadcastState(false); 

    } else {
        console.log("❌ Deku është bosh! Duke rrotulluar letrat...");
        if (discardPile.length > 1) {
            const lastCard = discardPile.pop();
            gameDeck = [...discardPile];
            discardPile = [lastCard];
            
            shuffle(gameDeck); // Përdorim funksionin tonë shuffle
            
            const drawnCard = gameDeck.pop();
            player.cards.push(drawnCard);

            socket.emit('cardDrawn', drawnCard);
            socket.emit('yourCards', player.cards);
            broadcastState(false);
        } else {
            socket.emit('errorMsg', "Nuk ka më letra në dek!");
        }
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
    
socket.on('discardCard', (card) => {
    // 1. Identifikojmë lojtarin që po tenton të hedhë letrën
    // Përdorim findIndex për siguri që të dimë saktë cilin index po prekim
    const currentIndex = players.findIndex(p => p.id === socket.id);
    const player = players[currentIndex];

    // 2. KONTROLLI I RADHËS (A është ky lojtari aktiv?)
    if (!player || socket.id !== activePlayerId) {
        console.log(`⚠️ Tentativë jashtë radhës nga: ${player?.name || socket.id}`);
        return;
    }

    // 3. KONTROLLI I SASISË
    if (player.cards.length !== 11) { 
        console.log(`⚠️ ${player.name} tentoi të hidhte me ${player.cards.length} letra.`);
        socket.emit('errorMsg', "Duhet të kesh 11 letra për të hedhur.");
        broadcastState(true); 
        return;
    }

    // 4. MBROJTJA E XHOKERIT
    if (card.v === '★' || card.v === 'Xhoker' || card.v === 'Jokeri') {
        socket.emit('errorMsg', "Xhokeri nuk mund të hidhet në tokë!");
        broadcastState(true); 
        return; 
    }

    // 5. GJETJA DHE HEQJA E LETRËS
    const cardIndex = player.cards.findIndex(c => {
        if (card.id && c.id) return c.id === card.id;
        return c.v === card.v && c.s === card.s;
    });
    
    if (cardIndex !== -1) {
        const removedCard = player.cards.splice(cardIndex, 1)[0];
        if (typeof discardPile === 'undefined') discardPile = [];
        discardPile.push(removedCard);
        
        console.log(`✅ ${player.name} hodhi ${removedCard.v}${removedCard.s}.`);

        // 6. NDËRRIMI I RADHËS (STAFETA)
        let foundNext = false;
        // Fillojmë kërkimin nga lojtari tjetër në rradhë
        for (let i = 1; i < players.length; i++) {
            let checkIdx = (currentIndex + i) % players.length;
            if (!players[checkIdx].isOut) {
                activePlayerIndex = checkIdx;
                activePlayerId = players[activePlayerIndex].id; // Përditësojmë ID-në globale
                foundNext = true;
                break;
            }
        }
        
        if (!foundNext) {
            activePlayerId = players[currentIndex].id;
        }

        console.log(`➡️ Radha kaloi te: ${players[activePlayerIndex].name}`);

        // 7. SINKRONIZIMI FINAL (Njoftojmë të gjithë)
        broadcastState(true);

    } else {
        console.log(`❌ Letra nuk u gjet te ${player.name}`);
        broadcastState(true);
    }
}); // Kjo kllapë mbyll socket.on


    
// MBYLLJA (ZION!)
socket.on('declareZion', (data) => {
    const winner = players.find(p => p.id === socket.id);
    console.log("Tentativë mbylljeje nga:", winner?.name);
    console.log("Letrat e lojtarit në server:", winner?.cards.length);
    
    // 1. KONTROLLI I SIGURISË
    if (!winner || winner.id !== players[activePlayerIndex].id || winner.cards.length !== 11) {
        console.log(`⚠️ Tentativë e pavlefshme nga ${winner?.name}`);
        socket.emit('errorMsg', "Nuk mund të mbyllësh lojën! Kontrollo radhën ose numrin e letrave.");
        return;
    }

    let isHandValid = false;
    let closingCard = null;

    // Provojmë secilën letër si letër mbyllëse (përveç Xhokerit)
    for (let i = 0; i < winner.cards.length; i++) {
        const testHand = [...winner.cards];
        const removed = testHand.splice(i, 1)[0];

        // Rregull: Xhokeri nuk lejohet si letër mbyllëse
        if (['★', 'Xhoker', 'Jokeri'].includes(removed.v)) continue;

        // Kontrollojmë nëse 10 letrat e mbetura formojnë grupe valide
        if (isDoraValid(testHand)) {
            isHandValid = true;
            closingCard = removed; 
            winner.cards.splice(i, 1); // E heqim përfundimisht nga dora e fituesit
            break;
        }
    }

    if (!isHandValid) {
        console.log(`❌ ${winner.name} tentoi të mbyllet me letra të parregullta!`);
        socket.emit('errorMsg', "Kombinim i pavlefshëm! Letrat nuk janë të grupuara saktë.");
        return;
    }

    // Shtojmë letrën mbyllëse te stiva
    if (closingCard) discardPile.push(closingCard);

    const isJackpotWin = data.isJackpotClosing || false;
    console.log(`🏆 ZION! ${winner.name} fiton! (Jackpot: ${isJackpotWin})`);

    // 2. LLOGARITJA E PIKËVE
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

    // 3. NJOFTIMI I REZULTATEVE
    io.emit('roundOver', {
        winnerName: winner.name,
        isJackpot: isJackpotWin,
        updatedPlayers: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            history: p.history,
            isOut: p.isOut
        }))
    });

    // 4. RESETIMI I RADHËS DHE TAVOLINËS
    dealerIndex = (dealerIndex + 1) % players.length;
    while(players[dealerIndex].isOut) {
        dealerIndex = (dealerIndex + 1) % players.length;
    }
    activePlayerIndex = (dealerIndex + 1) % players.length;

    discardPile = [];   
    jackpotCard = null; 

    // 5. KONTROLLI I FUNDIT TË LOJËS
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

// Ky funksion do të përdoret kur dikush thërret "ZION"
function calculateScore(cards) {
    let score = 0;
    if (!cards || cards.length === 0) return 0;

    cards.forEach(card => {
        // 1. Kontrolli i "blinduar" për Xhokerin (i kap të gjitha variantet)
        if (card.v === '★' || card.v === 'Jokeri' || card.v === 'Xhoker' || card.v === 'joker') {
            score += 0; // Nuk shton pikë (0 pikë)
        } 
        // 2. Letrat e rënda (10, J, Q, K, A) vlejnë 10 pikë
        else if (['A', 'K', 'Q', 'J', '10'].includes(card.v)) {
            score += 10;
        } 
        // 3. Letrat 2-9 vlejnë sa numri i tyre
        else {
            let val = parseInt(card.v);
            if (!isNaN(val)) score += val;
        }
    });
    return score;
}
function broadcastState(shouldSendCards = false) {
    if (players.length === 0) return;

    // 1. SINKRONIZIMI I ID-së SË LOJTARIT AKTUAL
    activePlayerId = players[activePlayerIndex]?.id || null;

    // 2. PËRGATITJA E MESAZHIT TË LOBBY
    const activePlayersCount = players.filter(p => !p.isOut).length;
    let lobbyMsg = "ZION 71\nNIS LOJËN (START)\n";
    if (!gameStarted) {
        if (activePlayersCount < 2) {
            lobbyMsg += "Prit lojtarët e tjerë të futen...";
        } else {
            lobbyMsg += `${activePlayersCount} lojtarë janë aktivë. Mund të nisni lojën!`;
        }
    }

    // 3. DËRGIMI I EVENTEVE TË PËRGJITHSHME (Publike për të gjithë)
    io.emit('lobbyMessage', lobbyMsg);

    io.emit('updateGameState', {
        gameStarted: gameStarted,
        players: players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            cardCount: p.cards.length, // Siguria: dërgojmë vetëm numrin, jo vlerat
            isOut: p.isOut
        })),
        activePlayerId: activePlayerId,
        discardPile: discardPile, 
        discardPileTop: discardPile[discardPile.length - 1] || null,
        jackpotCard: jackpotCard
    });

    // 4. DËRGIMI I LETRAVE PRIVATE (Vetëm nëse duhet)
    // Këtu e kemi bërë që letrat të dërgohen vetëm kur shouldSendCards është true
    // për të shmangur trafikun e tepërt kur ndryshon vetëm radha.
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
