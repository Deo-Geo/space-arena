const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://mxrylnjaluxwjhprjrnv.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14cnlsbmphbHV4d2pocHJqcm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDI5MDYsImV4cCI6MjA4ODM3ODkwNn0.iWx6IEieYbR8qL87_Fnswd5A7VX5W8gSvNoOnvjV2_I';
const supabase = createClient(supabaseUrl, supabaseKey);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Game State
const MAP_SIZE = 3000;
const players = {};
const projectiles = [];

// Game Constants
const MAX_HP = 2000;
const REGEN_DELAY = 7000;
const DAMAGE = 400;
const PROJECTILE_SPEED = 15;
const PLAYER_SPEED = 5;

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Login logic
    socket.on('login', async (password) => {
        // Check Supabase
        let { data, error } = await supabase.from('accounts').select('*').eq('password', password).single();
        
        if (!data) {
            // Create new account
            const res = await supabase.from('accounts').insert([{ password, kills: 0 }]).select().single();
            data = res.data;
        }

        // Spawn player
        players[socket.id] = {
            id: socket.id,
            password: password,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            angle: 0,
            hp: MAX_HP,
            kills: data.kills,
            lastHitTime: 0,
            inputs: { w: false, a: false, s: false, d: false }
        };

        socket.emit('loggedIn', players[socket.id]);
    });

    // Handle Input
    socket.on('input', (inputs) => {
        if (players[socket.id]) {
            players[socket.id].inputs = inputs.keys;
            players[socket.id].angle = inputs.angle;
        }
    });

    // Handle Shooting
    socket.on('shoot', () => {
        const p = players[socket.id];
        if (p && p.hp > 0) {
            projectiles.push({
                x: p.x,
                y: p.y,
                angle: p.angle,
                ownerId: socket.id,
                life: 100 // frames before despawn
            });
        }
    });

    // Leaderboard request
    socket.on('getLeaderboard', async () => {
        const { data } = await supabase.from('accounts').select('*').order('kills', { ascending: false }).limit(10);
        socket.emit('leaderboardData', data);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Server Game Loop (60 FPS)
setInterval(() => {
    const now = Date.now();

    // 1. Update Players
    for (let id in players) {
        let p = players[id];
        if (p.hp <= 0) continue;

        if (p.inputs.w) p.y -= PLAYER_SPEED;
        if (p.inputs.s) p.y += PLAYER_SPEED;
        if (p.inputs.a) p.x -= PLAYER_SPEED;
        if (p.inputs.d) p.x += PLAYER_SPEED;

        // Keep inside map limits
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        // Health Regen
        if (p.hp < MAX_HP && now - p.lastHitTime > REGEN_DELAY) {
            p.hp = Math.min(MAX_HP, p.hp + 5); // Regenerate 5 HP per tick
        }
    }

    // 2. Update Projectiles & Collisions
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let proj = projectiles[i];
        proj.x += Math.cos(proj.angle) * PROJECTILE_SPEED;
        proj.y += Math.sin(proj.angle) * PROJECTILE_SPEED;
        proj.life--;

        let hit = false;
        // Check collision with players
        for (let id in players) {
            let p = players[id];
            if (id !== proj.ownerId && p.hp > 0) {
                let dist = Math.hypot(p.x - proj.x, p.y - proj.y);
                if (dist < 40) { // Hitbox radius
                    hit = true;
                    p.hp -= DAMAGE;
                    p.lastHitTime = now;

                    if (p.hp <= 0) {
                        // Player dies
                        const killer = players[proj.ownerId];
                        if (killer) {
                            killer.kills++;
                            // Update Supabase
                            supabase.from('accounts').update({ kills: killer.kills }).eq('password', killer.password).then();
                        }
                        
                        // Respawn victim
                        setTimeout(() => {
                            if(players[id]) {
                                players[id].hp = MAX_HP;
                                players[id].x = Math.random() * MAP_SIZE;
                                players[id].y = Math.random() * MAP_SIZE;
                            }
                        }, 3000); // 3 second respawn
                    }
                    break;
                }
            }
        }

        if (hit || proj.life <= 0) {
            projectiles.splice(i, 1);
        }
    }

    // 3. Broadcast state to everyone
    io.emit('gameState', { players, projectiles });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));