const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images
app.use(express.static(path.join(__dirname, 'public')));

/**
 * IN-MEMORY DATA STORE
 * In a production app, these would be in a database like Firestore or MongoDB.
 */
let messages = [];
let users = {}; // Key: username, Value: user object

// Mock some initial data
const BOT_USER = {
    username: "SystemBot",
    password: "bot",
    role: "Bot",
    pfp: null,
    isOnline: true,
    lastSeen: Date.now()
};
users["SystemBot"] = BOT_USER;

messages.push({
    username: "SystemBot",
    role: "Bot",
    pfp: null,
    text: "Welcome to the Global Lobby! The frequency is open.",
    timestamp: new Date().toISOString()
});

/**
 * AUTH / LOGIN ENDPOINT
 * Handles registration and login, and updates profile data (like PFP).
 */
app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pfp } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    // Simple logic: if user doesn't exist, create them. If they do, verify password.
    if (!users[identifier]) {
        users[identifier] = {
            username: identifier,
            password: password,
            role: "VIP", // Default role
            pfp: pfp || null,
            isOnline: true,
            lastSeen: Date.now()
        };
    } else {
        const user = users[identifier];
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        
        // Update online status and PFP if provided
        user.isOnline = true;
        user.lastSeen = Date.now();
        if (pfp) user.pfp = pfp; 
    }

    res.json({ success: true, user: users[identifier] });
});

/**
 * MESSAGES ENDPOINTS
 */
app.get('/api/messages', (req, res) => {
    // Return last 50 messages
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
    
    // Auto-clean old messages
    if (messages.length > 200) messages.shift();

    res.status(201).json(newMessage);
});

/**
 * USERS DIRECTORY ENDPOINT
 */
app.get('/api/users', (req, res) => {
    // Cleanup offline users based on lastSeen (15 second timeout)
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        if (now - u.lastSeen > 15000) u.isOnline = false;
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
 * PROFILE UPDATE ENDPOINT
 */
app.put('/api/users/profile', (req, res) => {
    const { currentUsername, username, email, bio, profilePic } = req.body;
    
    if (!users[currentUsername]) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[currentUsername];
    
    // Handle username change if unique
    if (username && username !== currentUsername) {
        if (users[username]) {
            return res.status(400).json({ success: false, message: "Username taken" });
        }
        delete users[currentUsername];
        user.username = username;
        users[username] = user;
    }

    if (email) user.email = email;
    if (bio) user.bio = bio;
    if (profilePic) user.pfp = profilePic;

    res.json({ success: true, user });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Frequency stabilized on port ${PORT}`);
});
