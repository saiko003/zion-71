// ==========================================
// 1. KONFIGURIMI DHE LIDHJA
// ==========================================
const socket = io('https://zion-71-server.onrender.com', {
    transports: ['polling', 'websocket']
});

// Ruajtja e emrit dhe identifikimi
let myName = localStorage.getItem('zion_player_name') || prompt("Shkruaj emrin tënd:");
if (!myName) myName = "Lojtar_" + Math.floor(Math.random() * 1000);
localStorage.setItem('zion_player_name', myName);

let doraImeData = [];
let isMyTurn = false;

// Bashkohu në lojë
socket.emit('joinGame', myName);

// ==========================================
// 2. SCOREBOARD DINAMIK (Pika 17)
// ==========================================
socket.on('updateGameState', (data) => {
    updateScoreboard(data.players, data.activePlayerId);
    updateGameFlow(data);
});

function updateScoreboard(players, activeId) {
    const scoreBody = document.getElementById('score-body');
    const scoreHeader = document.querySelector('#score-table thead tr');
    if (!scoreBody || !scoreHeader) return;

    // Gjejmë sa është numri maksimal i raundeve që është luajtur
    let maxRounds = players.reduce((max, p) => Math.max(max, (p.history ? p.history.length : 0)), 0);

    // Krijojmë Header-in: Lojtari | R1 | R2 | ... | Total
    let headerHTML = `<th>Lojtari</th>`;
    for (let i = 1; i <= maxRounds; i++) {
        headerHTML += `<th>R${i}</th>`;
    }
    headerHTML += `<th>Total</th>`;
    scoreHeader.innerHTML = headerHTML;

    // Mbushim rreshtat për çdo lojtar
    scoreBody.innerHTML = '';
    players.forEach(player => {
        const row = document.createElement('tr');
        if (player.id === activeId) row.classList.add('active-row'); // Pika 15: Turn Indicator
        if (player.score > 71) row.classList.add('eliminated'); // Pika 9: Eliminimi

        let nameCell = `<td>${player.name} ${player.id === socket.id ? '<b>(Ti)</b>' : ''}</td>`;
        
        let historyCells = '';
        for (let i = 0; i < maxRounds; i++) {
            let pikaRaundi = (player.history && player.history[i] !== undefined) ? player.history[i] : '-';
            historyCells += `<td>${pikaRaundi}</td>`;
        }

        let totalCell = `<td><strong>${player.score}</strong></td>`;
        
        row.innerHTML = nameCell + historyCells + totalCell;
        scoreBody.appendChild(row);
    });
}
function updateGameFlow(data) {
    isMyTurn = (data.activePlayerId === socket.id);
    
    // Vizualizimi i radhës (Pika 15)
    document.body.classList.toggle('my-turn-glow', isMyTurn);
    
    // Kontrolli i Deck-ut (Stiva) - Pika 12
    const deck = document.getElementById('deck');
    if (isMyTurn && doraImeData.length === 10) {
        deck.classList.add('active-deck'); // Bëhet me dritë që të tërheqësh letrën
    } else {
        deck.classList.remove('active-deck');
    }

    // Përditësojmë Jackpot-in (Pika 6)
    const jackpot = document.getElementById('jackpot');
    if (data.jackpotCard) {
        jackpot.innerHTML = `${data.jackpotCard.v}<br>${data.jackpotCard.s}`;
        jackpot.style.color = ['♥', '♦'].includes(data.jackpotCard.s) ? 'red' : 'white';
        jackpot.style.display = 'block';
    }
}

// Butoni Start (Vetëm Host-i e ka, pika 13)
document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('startGame');
});
