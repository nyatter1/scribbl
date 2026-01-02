const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// API Configuration - Using your OpenAI Key
const apiKey = "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";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
 * AI LOGIC: OpenAI Fetch with Exponential Backoff
 */
async function fetchAIResponse(userPrompt, chatHistory) {
    // Format the last few messages for context
    const context = chatHistory.slice(-6).map(m => ({
        role: m.username === "System" ? "assistant" : "user",
        content: `${m.username}: ${m.text}`
    }));

    const payload = {
        model: "gpt-3.5-turbo",
        messages: [
            { 
                role: "system", 
                content: "Your name is System. You are the AI administrator of a high-tech, futuristic chatroom. Keep responses concise, helpful, and maintain a cool, slightly robotic but friendly persona. Do not use markdown bolding." 
            },
            ...context,
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
    };

    let delay = 1000;
    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch(OPENAI_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                return data.choices[0].message.content.trim();
            } else {
                const errData = await response.json();
                console.error("OpenAI Error:", errData);
            }
        } catch (error) {
            console.error("Fetch attempt failed:", error);
        }
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
    }
    return "Protocol Error: Unable to reach the central intelligence core.";
}

/**
 * AUTHENTICATION
 */
app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pfp } = req.body;
    if (!identifier || !password) return res.status(400).json({ success: false });

    let assignedRole = "VIP";
    if (identifier.toLowerCase() === "developer") assignedRole = "Developer";

    if (!users[identifier]) {
        users[identifier] = {
            username: identifier,
            password: password,
            role: assignedRole,
            pfp: pfp || null,
            isOnline: true,
            lastSeen: Date.now()
        };
    } else {
        const user = users[identifier];
        if (user.password !== password) return res.status(401).json({ success: false });
        user.isOnline = true;
        user.lastSeen = Date.now();
        user.role = assignedRole;
        if (pfp) user.pfp = pfp; 
    }
    res.json({ success: true, user: users[identifier] });
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
        role: role || "VIP",
        pfp: pfp || null,
        timestamp: new Date().toISOString()
    };

    messages.push(userMessage);
    res.status(201).json(userMessage);

    // AI TRIGGER CHECK
    // If the message starts with "System " (case insensitive)
    if (text.toLowerCase().startsWith("system ")) {
        const prompt = text.slice(7).trim();
        if (prompt) {
            // Trigger AI in background
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
 * USERS & HEARTBEAT
 */
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        if (u.username !== "System" && now - u.lastSeen > 12000) u.isOnline = false;
        return { username: u.username, role: u.role, pfp: u.pfp, isOnline: u.isOnline };
    });
    res.json(userList);
});

app.post('/api/heartbeat', (req, res) => {
    const { username, pfp } = req.body;
    if (users[username]) {
        users[username].isOnline = true;
        users[username].lastSeen = Date.now();
        if (pfp) users[username].pfp = pfp;
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[NETWORK] AI-Lobby live on port ${PORT}`));
