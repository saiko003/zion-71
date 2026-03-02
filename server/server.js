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

    // 6️⃣ Broadcast gjendja
    broadcastState(true);

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
    
socket.on('cardDiscarded', (card) => {
    // 1. LOG PËR DEBUG
    console.log(`--- Tentativë hedhjeje nga ${socket.id} ---`);
    console.log("Të dhënat e letrës që erdhën:", card);

    const player = players[activePlayerIndex];

    // 2. KONTROLLI I RADHËS
    if (!player || player.id !== socket.id) {
        console.log(`⚠️ Tentativë jashtë radhës nga: ${socket.id}`);
        return;
    }

    // 3. KONTROLLI I SASISË (Duhet të ketë saktësisht 11 letra për të hedhur)
    if (player.cards.length !== 11) { 
        console.log(`⚠️ ${player.name} tentoi të hidhte me ${player.cards.length} letra.`);
        socket.emit('errorMsg', "Duhet të kesh 11 letra për të hedhur.");
        broadcastState(true); 
        return;
    }

    // 4. MBROJTJA E XHOKERIT (Ylli nuk lejohet të hidhet)
    if (card.v === '★' || card.v === 'Xhoker' || card.v === 'Jokeri') {
        console.log(`🚫 Bllokuar: ${player.name} tentoi të hidhte Xhokerin.`);
        socket.emit('errorMsg', "Xhokeri nuk mund të hidhet në tokë!");
        broadcastState(true); 
        return; 
    }

    // 5. GJETJA E LETRËS (Prioritet ID-ja për sinkronizim 100%)
    // Përdorim ID-në që dërgon Front-endi yt (dataset.id)
    const cardIndex = player.cards.findIndex(c => 
        (card.id && c.id === card.id) || (c.v === card.v && c.s === card.s)
    );
    
    if (cardIndex !== -1) {
        // SUKSES: Letra u gjet në server
        const removedCard = player.cards.splice(cardIndex, 1)[0];
        
        // Sigurohemi që discardPile ekziston para se të bëjmë push
        if (!discardPile) discardPile = [];
        discardPile.push(removedCard);
        
        console.log(`✅ ${player.name} hodhi ${removedCard.v}${removedCard.s}. Mbeti me ${player.cards.length} letra.`);

        // 6. NDËRRIMI I RADHËS (Stafeta)
        let startingIndex = activePlayerIndex;
        let foundNextPlayer = false;

        // Kërkojmë lojtarin e radhës që nuk është 'isOut'
        for (let i = 1; i < players.length; i++) {
            let nextIdx = (startingIndex + i) % players.length;
            if (!players[nextIdx].isOut) {
                activePlayerIndex = nextIdx;
                foundNextPlayer = true;
                break;
            }
        }
        
        // Nëse nuk u gjet lojtar tjetër, radha mbetet te i njëjti (rast emergjence)
        if (!foundNextPlayer) activePlayerIndex = startingIndex;

        console.log(`➡️ Radha kaloi te: ${players[activePlayerIndex].name}`);

        // 7. SINKRONIZIMI FINAL
        broadcastState(true);

    } else {
        // GABIM: Letra nuk u gjet
        console.log(`❌ GABIM SINKRONIZIMI: Letra ${card.v}${card.s} nuk u gjet te ${player.name}`);
        socket.emit('errorMsg', "Gabim sinkronizimi! Rifresko faqen nëse problemet vazhdojnë.");
        broadcastState(true);
    }
});
    // MBYLLJA (ZION!)
// MBYLLJA (ZION!)
socket.on('playerClosed', (data) => {
    const winner = players.find(p => p.id === socket.id);
    
    // 1. KONTROLLI I SIGURISË DHE VERIFIKIMI I LETRAVE
    // Duhet të jetë radha e tij dhe duhet të ketë 11 letra
    if (!winner || winner.id !== players[activePlayerIndex].id || winner.cards.length !== 11) {
        console.log(`⚠️ Tentativë mbylljeje e pavlefshme nga ${winner?.name}`);
        socket.emit('errorMsg', "Nuk mund të mbyllësh lojën! Kontrollo letrat ose radhën.");
        return;
    }

    // --- KONTROLLI I ZIONIT (Bllokon Q-K-A-2 dhe kombinimet e gabuara) ---
    // Ky funksion kontrollon nëse të 11 letrat formojnë grupe/vargje valide
    const isHandValid = checkRecursive(winner.cards, 0); 

    if (!isHandValid) {
        console.log(`❌ ${winner.name} tentoi të mbyllet me letra të parregullta!`);
        socket.emit('errorMsg', "Kombinim i pavlefshëm! Vargu Q-K-A-2 nuk lejohet.");
        return; // Ndalon procesin e mbylljes nëse letrat nuk janë në rregull
    }
    // --------------------------------------------------------------------

    // Përcaktojmë nëse u mbyll me letrën e fundit të dekut (Jackpot) 
    const isJackpotWin = data.isJackpotClosing || false;
    console.log(`🏆 RAUNDI U MBYLL RREGULLISHT: ${winner.name} fiton! (Jackpot: ${isJackpotWin})`);

    // 2. LLOGARITJA E PIKËVE PËR TË GJITHË
    players.forEach(p => {
        if (p.isOut) return; // Lojtarët e djegur nuk preken

        if (p.id !== winner.id) {
            // Llogarisim pikët e letrare që i kanë mbetur në dorë
            let roundPoints = calculateScore(p.cards); 
            
            // Nëse fituesi u mbyll me Jackpot, pikët ndëshkuese dyfishohen
            if (isJackpotWin) {
                roundPoints *= 2;
            }

            // Shtohen pikët në totalin kumulativ
            p.score += roundPoints;
            
            // Regjistrojmë historikun
            p.history.push(isJackpotWin ? `${roundPoints}!` : roundPoints);
            
            // Kontrolli i djegies (71 ose më shumë)
            if (p.score >= 71) {
                p.isOut = true;
                console.log(`💀 Lojtari ${p.name} u dogj (Score: ${p.score})`);
            }
        } else {
            // Për fituesin shënojmë "X"
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

    // 4. NDRYSHIMI I DEALER-IT PËR RAUNDIN TJETËR
    dealerIndex = (dealerIndex + 1) % players.length;
    
    let safetyCounter = 0;
    while(players[dealerIndex].isOut && safetyCounter < players.length) {
        dealerIndex = (dealerIndex + 1) % players.length;
        safetyCounter++;
    }

    // Pastrojmë tavolinën
    discardPile = [];   
    jackpotCard = null; 

    // 5. KONTROLLI I FUNDIT TË LOJËS
    const activePlayers = players.filter(p => !p.isOut);
    
    if (activePlayers.length <= 1) {
        const finalWinner = activePlayers.length === 1 ? activePlayers[0].name : "Askush";
        io.emit('gameOver', { winner: finalWinner });
        console.log(`🏁 LOJA PËRFUNDOI! Fituesi final: ${finalWinner}`);
    } else {
        setTimeout(() => {
            console.log("♻️ Duke nisur raundin e ri...");
            startNewRound(); 
        }, 4000); 
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveri po punon në portën ${PORT}`));

// server.js

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
