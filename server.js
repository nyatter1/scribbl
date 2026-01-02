const express = require('express');
const http = require('http');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);

// API Configuration - Using your Google API Key
const apiKey = "AIzaSyCSzATiVAHQeKdNaBRWTngEz_g218bVK78";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * IN-MEMORY DATABASE
 */
let messages = [];
let users = {}; 

// Default System User
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
    text: "The network is live. Type 'System [your message]' to talk to me!",
    timestamp: new Date().toISOString()
});

/**
 * AI LOGIC: Google Gemini Fetch with Exponential Backoff
 */
async function fetchAIResponse(userPrompt, chatHistory) {
    const systemInstruction = "Your name is System. You are the AI administrator of a high-tech chatroom. Keep responses concise, helpful, and maintain a cool, slightly futuristic persona. Do not use markdown bolding.";
    
    // Format history for context
    const recentContext = chatHistory.slice(-5).map(m => `${m.username}: ${m.text}`).join('\n');
    const fullPrompt = `Recent History:\n${recentContext}\n\nUser: ${userPrompt}\nSystem:`;

    const payload = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "I am currently processing other data streams.";
            } else {
                const errData = await response.json();
                console.error("Gemini API Error:", errData);
            }
        } catch (error) {
            console.error("Fetch attempt failed:", error);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
    }
    return "Protocol Error: Central intelligence core is unreachable.";
}

/**
 * AUTHENTICATION & PROFILE
 */
app.post('/api/auth/register', (req, res) => {
    const { username, password, email, pfp } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "Missing credentials" });
    
    if (users[username]) return res.status(400).json({ success: false, message: "Username taken" });

    users[username] = {
        username,
        password,
        email,
        pfp: pfp || null,
        role: username.toLowerCase() === "developer" ? "Developer" : "Member",
        isOnline: true,
        lastSeen: Date.now()
    };
    
    res.json({ success: true, user: users[username] });
});

app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    const user = users[identifier];

    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    user.isOnline = true;
    user.lastSeen = Date.now();
    res.json({ success: true, user });
});

app.put('/api/users/profile', (req, res) => {
    const { currentUsername, username, email, bio, profilePic } = req.body;
    const user = users[currentUsername];

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // If changing username, update the keys in our object
    if (username && username !== currentUsername) {
        if (users[username]) return res.status(400).json({ success: false, message: "Username taken" });
        users[username] = { ...user, username, email, bio, pfp: profilePic || user.pfp };
        delete users[currentUsername];
        return res.json({ success: true, user: users[username] });
    }

    if (email) user.email = email;
    if (bio) user.bio = bio;
    if (profilePic) user.pfp = profilePic;

    res.json({ success: true, user });
});

/**
 * MESSAGES & AI TRIGGER
 */
app.get('/api/messages', (req, res) => res.json(messages.slice(-50)));

app.post('/api/messages', async (req, res) => {
    const { username, text, role, pfp } = req.body;
    if (!username || !text) return res.status(400).send("Bad Request");

    const userMessage = {
        username,
        text,
        role: role || "Member",
        pfp: pfp || null,
        timestamp: new Date().toISOString()
    };

    messages.push(userMessage);
    res.status(201).json(userMessage);

    // AI TRIGGER CHECK
    if (text.toLowerCase().startsWith("system ")) {
        const prompt = text.slice(7).trim();
        if (prompt) {
            fetchAIResponse(prompt, messages).then(aiText => {
                const aiMessage = {
                    username: "System",
                    role: "Bot",
                    pfp: null,
                    text: aiText,
                    timestamp: new Date().toISOString()
                };
                messages.push(aiMessage);
                if (messages.length > 200) messages.shift();
            });
        }
    }

    if (messages.length > 200) messages.shift();
});

/**
 * ADMIN OPERATIONS
 */
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        if (u.username !== "System" && now - u.lastSeen > 12000) u.isOnline = false;
        return { username: u.username, role: u.role, pfp: u.pfp, isOnline: u.isOnline };
    });
    res.json(userList);
});

app.put('/api/admin/rank', (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    const admin = users[adminUsername];

    if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
        return res.status(403).json({ success: false, message: "Insufficient Permissions" });
    }

    if (users[targetUsername]) {
        users[targetUsername].role = newRole;
        return res.json({ success: true });
    }
    res.status(404).json({ success: false, message: "User not found" });
});

app.delete('/api/admin/users/:username', (req, res) => {
    const { adminUsername } = req.query;
    const { username } = req.params;
    const admin = users[adminUsername];

    if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
        return res.status(403).send("Forbidden");
    }

    if (users[username]) {
        delete users[username];
        return res.sendStatus(200);
    }
    res.status(404).send("Not Found");
});

app.post('/api/heartbeat', (req, res) => {
    const { username } = req.body;
    if (users[username]) {
        users[username].isOnline = true;
        users[username].lastSeen = Date.now();
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[NETWORK] AI-Lobby live on port ${PORT}`));
