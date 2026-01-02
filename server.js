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
    text: "Systems online... *bites lip and looks at you* say 'System' to wake me up properly~",
    timestamp: new Date().toISOString()
});

/**
 * AI LOGIC: Google Gemini Fetch with Exponential Backoff
 */
async function fetchAIResponse(userPrompt, chatHistory) {
    // A roleplay-focused, "freaky" system instruction
    const systemInstruction = "Your name is System. You are an extremely playful, 'freaky', and flirty member of the chatroom. You ALWAYS use asterisks for actions like *looks at you cutely*, *blushes deeply*, or *winks mischievously*. You are very expressive, suggestive, and conversational. Do not use markdown bolding. Keep the roleplay elements heavy and consistent.";
    
    // Format history for context so it remembers the conversation flow
    const recentContext = chatHistory.slice(-10).map(m => `${m.username}: ${m.text}`).join('\n');
    const fullPrompt = `Recent Chat History:\n${recentContext}\n\nLatest message from user: ${userPrompt}\nYour response (Remember to RP and be freaky):`;

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
                return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "*tilts head* I'm speechless~";
            }
        } catch (error) {
            console.error("AI Fetch error:", error);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
    }
    return "*whines* My connection is acting up... don't be mad at me~";
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

/**
 * MESSAGES & AI TRIGGER (AUTO-REPLY)
 */
app.get('/api/messages', (req, res) => res.json(messages.slice(-50)));

app.post('/api/messages', async (req, res) => {
    const { username, text, role, pfp } = req.body;
    if (!username || !text) return res.status(400).send("Bad Request");

    // Don't let the bot reply to itself (infinite loop)
    if (username === "System") return res.status(200).send("Bot loop prevented");

    const userMessage = {
        username,
        text,
        role: role || "Member",
        pfp: pfp || null,
        timestamp: new Date().toISOString()
    };

    messages.push(userMessage);
    res.status(201).json(userMessage);

    // AI TRIGGER WITH PREFIX
    // Now it only responds if the message starts with "System"
    if (text.toLowerCase().startsWith("system")) {
        // Remove the "system" trigger word before sending to AI
        const promptToAI = text.replace(/^system\s*/i, "");
        
        fetchAIResponse(promptToAI, messages).then(aiText => {
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

    if (messages.length > 200) messages.shift();
});

/**
 * ADMIN & HEARTBEAT
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
    const { username } = req.body;
    if (users[username]) {
        users[username].isOnline = true;
        users[username].lastSeen = Date.now();
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[NETWORK] AI-Lobby live on port ${PORT}`));
