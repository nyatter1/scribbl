const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Middleware
// We use a 10mb limit to handle base64 profile picture uploads
app.use(express.json({ limit: '10mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

/**
 * IN-MEMORY DATA STORE
 * In a production environment, this would be replaced by a database like Firestore.
 */
let messages = [];
let users = {}; // Key: username, Value: user object

// Mock initial System user to welcome people
const BOT_USER = {
    username: "SystemBot",
    password: "bot",
    role: "Bot",
    pfp: null,
    isOnline: true,
    lastSeen: Date.now()
};
users["SystemBot"] = BOT_USER;

// Initial welcome message
messages.push({
    username: "SystemBot",
    role: "Bot",
    pfp: null,
    text: "Live Network initialized. Global Lobby is now active.",
    timestamp: new Date().toISOString()
});

/**
 * AUTH / LOGIN ENDPOINT
 * Handles registration and login simultaneously for simplicity.
 * Automatically handles the "Developer" rank assignment.
 */
app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pfp } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    // MANDATORY RULE: The username "Developer" is automatically granted the Developer rank.
    let assignedRole = "VIP";
    if (identifier.toLowerCase() === "developer") {
        assignedRole = "Developer";
    }

    if (!users[identifier]) {
        // New user registration
        users[identifier] = {
            username: identifier,
            password: password,
            role: assignedRole,
            pfp: pfp || null,
            isOnline: true,
            lastSeen: Date.now()
        };
    } else {
        // Existing user login
        const user = users[identifier];
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        
        // Update user heartbeat and status
        user.isOnline = true;
        user.lastSeen = Date.now();
        user.role = assignedRole; // Ensure Developer rank is maintained
        if (pfp) user.pfp = pfp; 
    }

    res.json({ success: true, user: users[identifier] });
});

/**
 * MESSAGES ENDPOINTS
 */
app.get('/api/messages', (req, res) => {
    // Return last 50 messages for performance
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
    
    // Keep memory clean
    if (messages.length > 200) messages.shift();

    res.status(201).json(newMessage);
});

/**
 * USERS DIRECTORY ENDPOINT
 * Used by the sidebar in Canvas to show who is online.
 */
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        // Heartbeat check: Users are considered offline after 12 seconds of inactivity
        if (u.username !== "SystemBot" && now - u.lastSeen > 12000) {
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
 * PROFILE UPDATE ENDPOINT
 * Allows users to change their bio, email, or profile picture.
 */
app.put('/api/users/profile', (req, res) => {
    const { currentUsername, username, email, bio, profilePic } = req.body;
    
    if (!users[currentUsername]) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[currentUsername];
    
    // Handle username change
    if (username && username !== currentUsername) {
        if (users[username]) {
            return res.status(400).json({ success: false, message: "Username already taken" });
        }
        // Migrate user data to new key
        delete users[currentUsername];
        user.username = username;
        
        // Re-enforce Developer rank if they changed to that name
        if (username.toLowerCase() === "developer") {
            user.role = "Developer";
        }
        
        users[username] = user;
    }

    if (email) user.email = email;
    if (bio) user.bio = bio;
    if (profilePic) user.pfp = profilePic;

    res.json({ success: true, user });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChatApp Server is running on port ${PORT}`);
});
