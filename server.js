const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config(); // Loads .env file if running locally

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- DATABASE CONFIGURATION ---
// This checks if the Render environment variable exists
if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is not defined in Environment Variables!");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // REQUIRED for Supabase connections
    }
});

// Test the connection immediately
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error acquiring client:', err.stack);
    }
    console.log('✅ Successfully connected to Supabase PostgreSQL!');
    release();
});

app.use(express.json());
app.use(express.static('public'));

// --- DATABASE INITIALIZATION ---
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'Member',
                pfp TEXT DEFAULT '',
                bio TEXT DEFAULT 'No bio recorded.',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                text TEXT NOT NULL,
                role TEXT NOT NULL,
                pfp TEXT DEFAULT '',
                timestamp BIGINT NOT NULL
            );
        `);
        console.log("✅ Database tables verified/created.");
    } catch (err) {
        console.error("❌ Database initialization error:", err);
    }
};
initDB();

// --- AUTH ROUTES ---

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && user.password === password) {
            const { password, ...userWithoutPassword } = user;
            res.json({ success: true, user: userWithoutPassword });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM users');
        const role = parseInt(countRes.rows[0].count) === 0 ? 'Developer' : 'Member';
        
        const result = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, pfp, bio',
            [username, password, role]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ success: false, message: "Username already exists" });
        } else {
            res.status(500).json({ success: false, message: "Registration failed" });
        }
    }
});

// --- PROFILE & ADMIN ROUTES ---

app.put('/api/profile/update', async (req, res) => {
    const { username, bio, pfp } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET bio = $1, pfp = $2 WHERE username = $3 RETURNING username, role, bio, pfp',
            [bio, pfp, username]
        );
        const updatedUser = result.rows[0];
        io.emit('user_updated', updatedUser);
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false, message: "Update failed" });
    }
});

app.put('/api/admin/rank', async (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    try {
        const adminCheck = await pool.query('SELECT role FROM users WHERE username = $1', [adminUsername]);
        const roles = ["Admin", "Super Admin", "Owner", "Developer", "Manager"];
        
        if (!adminCheck.rows[0] || !roles.includes(adminCheck.rows[0].role)) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const result = await pool.query(
            'UPDATE users SET role = $1 WHERE username = $2 RETURNING username, role, bio, pfp',
            [newRole, targetUsername]
        );
        
        if (result.rows.length > 0) {
            io.emit('user_updated', result.rows[0]);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: "User not found" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Rank update failed" });
    }
});

// --- REAL-TIME CHAT (SOCKET.IO) ---

let activeUsers = new Map();

io.on('connection', (socket) => {
    socket.on('join', async (user) => {
        const userData = { ...user, socketId: socket.id };
        activeUsers.set(socket.id, userData);

        try {
            const msgResult = await pool.query('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 50');
            socket.emit('init_data', {
                history: msgResult.rows,
                users: Array.from(activeUsers.values())
            });
        } catch (e) {
            console.error("Error fetching history:", e);
        }

        socket.broadcast.emit('user_joined', userData);
    });

    socket.on('send_message', async (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;

        const newMessage = {
            username: user.username,
            text: data.text,
            role: user.role,
            pfp: user.pfp,
            timestamp: Date.now()
        };

        try {
            await pool.query(
                'INSERT INTO messages (username, text, role, pfp, timestamp) VALUES ($1, $2, $3, $4, $5)',
                [newMessage.username, newMessage.text, newMessage.role, newMessage.pfp, newMessage.timestamp]
            );
            io.emit('new_message', newMessage);
        } catch (err) {
            console.error("Failed to save message:", err);
        }
    });

    socket.on('dev_command', async (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.role === 'Developer' && data.command === 'clear') {
            await pool.query('DELETE FROM messages');
            io.emit('clear_chat');
        }
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        io.emit('user_left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 VikVok Server live on port ${PORT}`);
});
