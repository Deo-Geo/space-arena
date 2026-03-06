import { io } from 'socket.io-client';

// NOTE: Change this to your Render backend URL once deployed!
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const socket = io(BACKEND_URL);

// DOM Elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const loginScreen = document.getElementById('login-screen');
const loginBtn = document.getElementById('login-btn');
const passInput = document.getElementById('password-input');
const ui = document.getElementById('ui');
const killCount = document.getElementById('kill-count');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardList = document.getElementById('leaderboard-list');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Assets
const shipImg = new Image();
shipImg.src = '/ship.png'; // Ensure ship.png is in the /public folder

// State
let myId = null;
let gameState = { players: {}, projectiles: [] };
let keys = { w: false, a: false, s: false, d: false };
let mouseAngle = 0;

// Login
loginBtn.addEventListener('click', () => {
    const password = passInput.value;
    if (password.length > 0) {
        socket.emit('login', password);
    }
});

socket.on('loggedIn', (playerData) => {
    myId = playerData.id;
    loginScreen.style.display = 'none';
    ui.style.display = 'block';
    requestAnimationFrame(gameLoop);
});

// Inputs
window.addEventListener('keydown', (e) => setKey(e.key.toLowerCase(), true));
window.addEventListener('keyup', (e) => setKey(e.key.toLowerCase(), false));
window.addEventListener('mousemove', (e) => {
    // Calculate angle relative to center of screen (where player is)
    mouseAngle = Math.atan2(e.clientY - canvas.height / 2, e.clientX - canvas.width / 2);
});
window.addEventListener('mousedown', () => socket.emit('shoot'));

function setKey(key, value) {
    if (['w', 'a', 's', 'd'].includes(key)) {
        keys[key] = value;
    }
}

// Network Updates
socket.on('gameState', (state) => {
    gameState = state;
    if (gameState.players[myId]) {
        killCount.innerText = gameState.players[myId].kills;
    }
});

// Leaderboard
leaderboardBtn.addEventListener('click', () => {
    socket.emit('getLeaderboard');
});
socket.on('leaderboardData', (data) => {
    leaderboardList.innerHTML = '';
    data.forEach((p, index) => {
        let li = document.createElement('li');
        li.innerText = `#${index + 1} - Kills: ${p.kills}`;
        leaderboardList.appendChild(li);
    });
    leaderboardModal.style.display = 'block';
});
document.getElementById('close-leaderboard').addEventListener('click', () => {
    leaderboardModal.style.display = 'none';
});

// Render Loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const myPlayer = gameState.players[myId];
    if (!myPlayer) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Send Input to server
    socket.emit('input', { keys, angle: mouseAngle });

    // Camera: Translate context so player is in center
    ctx.save();
    ctx.translate(canvas.width / 2 - myPlayer.x, canvas.height / 2 - myPlayer.y);

    // Draw Map Boundaries
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(0, 0, 3000, 3000);

    // Draw Projectiles
    ctx.fillStyle = 'yellow';
    gameState.projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Players
    for (let id in gameState.players) {
        let p = gameState.players[id];
        if (p.hp <= 0) continue; // Don't draw dead players

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        // Draw Ship (Assumes ship image faces right)
        ctx.drawImage(shipImg, -25, -25, 50, 50); 
        ctx.restore();

        // Draw HP Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(p.x - 25, p.y - 40, 50, 5);
        ctx.fillStyle = 'green';
        ctx.fillRect(p.x - 25, p.y - 40, 50 * (p.hp / 2000), 5);
    }

    ctx.restore(); // Restore camera translation

    // Dead overlay
    if (myPlayer.hp <= 0) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText("YOU DIED. Respawning...", canvas.width/2 - 200, canvas.height/2);
    }

    requestAnimationFrame(gameLoop);
}

// Handle Window Resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});