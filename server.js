const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Use a high limit for JSON to allow base64 profile pictures to be synced
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * IN-MEMORY DATABASE
 * This stores all live session data: messages, users, and ranks.
 */
let messages = [];
let users = {}; // Keyed by username

// Create a system user by default
const SYSTEM_USER = {
    username: "System",
    password: "bot",
    role: "Bot",
    pfp: null,
    isOnline: true,
    lastSeen: Date.now()
};
users["System"] = SYSTEM_USER;

// Initial system message
messages.push({
    username: "System",
    role: "Bot",
    pfp: null,
    text: "The network is live. Welcome to the Global Lobby.",
    timestamp: new Date().toISOString()
});

/**
 * AUTHENTICATION & RANK LOGIC
 */
app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pfp } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    // MANDATORY RULE: Automatically grant Developer rank to the username 'Developer'
    let assignedRole = "VIP";
    if (identifier.toLowerCase() === "developer") {
        assignedRole = "Developer";
    }

    if (!users[identifier]) {
        // Register new user
        users[identifier] = {
            username: identifier,
            password: password,
            role: assignedRole,
            pfp: pfp || null,
            isOnline: true,
            lastSeen: Date.now()
        };
    } else {
        // Log in existing user
        const user = users[identifier];
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        
        // Sync online status and profile pic
        user.isOnline = true;
        user.lastSeen = Date.now();
        user.role = assignedRole; // Keep rank updated
        if (pfp) user.pfp = pfp; 
    }

    res.json({ success: true, user: users[identifier] });
});

/**
 * MESSAGES BROADCASTING
 */
app.get('/api/messages', (req, res) => {
    // Return latest messages
    res.json(messages.slice(-50));
});

app.post('/api/messages', (req, res) => {
    const { username, text, role, pfp } = req.body;
    
    if (!username || !text) return res.status(400).send("Bad Request");

    const newMessage = {
        username,
        text,
        role: role || "VIP",
        pfp: pfp || null,
        timestamp: new Date().toISOString()
    };

    messages.push(newMessage);
    
    // Memory management: prevent massive arrays
    if (messages.length > 200) messages.shift();

    res.status(201).json(newMessage);
});

/**
 * USER DIRECTORY & ONLINE TRACKING
 * This powers the sidebar in index.html
 */
app.get('/api/users', (req, res) => {
    const now = Date.now();
    
    // Convert object to array and calculate current online status
    const userList = Object.values(users).map(u => {
        // A user is considered offline if they haven't pinged the server in 12 seconds
        if (u.username !== "System" && now - u.lastSeen > 12000) {
            u.isOnline = false;
        }
        return {
            username: u.username,
            role: u.role,
            pfp: u.pfp,
            isOnline: u.isOnline
        };
    });

    res.json(userList);
});

/**
 * HEARTBEAT PING
 * index.html calls this periodically to stay "Live"
 */
app.post('/api/heartbeat', (req, res) => {
    const { username, pfp } = req.body;
    if (users[username]) {
        users[username].isOnline = true;
        users[username].lastSeen = Date.now();
        if (pfp) users[username].pfp = pfp;
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

/**
 * START SERVER
 */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[NETWORK] Frequency stabilized on port ${PORT}`);
});
