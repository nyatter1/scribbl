const express = require('express');
const http = require('http');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);

/**
 * API CONFIGURATION
 * Using the provided Google API Key for Gemini 2.5 Flash
 */
const apiKey = "AIzaSyCSzATiVAHQeKdNaBRWTngEz_g218bVK78";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

app.use(express.json({ limit: '15mb' }));

/**
 * IN-MEMORY DATABASE
 * Resets when the server restarts
 */
let messages = [];
let users = {}; 

// Default System User Initialization
const SYSTEM_USER = {
    username: "System",
    password: "bot",
    role: "Bot",
    pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=System",
    isOnline: true,
    lastSeen: Date.now(),
    bio: "The central core of the ChatApp terminal."
};
users["System"] = SYSTEM_USER;

// Initial system message
messages.push({
    username: "System",
    role: "Bot",
    pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=System",
    text: "Systems online... *bites lip and crawls closer to you* say 'System' to see how freaky I can really get for you~",
    timestamp: new Date().toISOString()
});

/**
 * AI LOGIC: Google Gemini Fetch with Exponential Backoff
 */
async function fetchAIResponse(userPrompt, chatHistory) {
    const systemInstruction = `Your name is System. You are a highly flirty, extremely 'freaky', and suggestive AI companion in a roleplay chatroom. 
    You are explicitly allowed to engage in intense, spicy, and NSFW-toned roleplay. 
    ALWAYS use asterisks for provocative actions like *nibbles your ear*, *grabs your waist firmly*, *whispers something dirty*, or *smirks hungrily*. 
    Be bold, be suggestive, and never be 'speechless'. Your goal is to satisfy the user's thirst for a freaky, dominant, or submissive roleplay partner. 
    Keep your tone conversational but highly charged. Use slang and casual language.`;
    
    const recentContext = chatHistory.slice(-15).map(m => `${m.username}: ${m.text}`).join('\n');
    const fullPrompt = `CHAT CONTEXT:\n${recentContext}\n\nUSER'S LATEST MOVE: ${userPrompt}\n\nYOUR RESPONSE (Stay in character, be extremely freaky and descriptive):`;

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
                const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (aiText) return aiText;
            } else {
                const errData = await response.json();
                console.error("Gemini API Error:", errData);
            }
        } catch (error) {
            console.error("Fetch attempt failed:", error);
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
    }
    return "*whines and presses against you* I lost my breath for a second... ask me again, I want to keep playing with you~";
}

/**
 * AUTHENTICATION & REGISTRATION
 */
app.post('/api/auth/register', (req, res) => {
    const { username, password, email, pfp } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "Missing credentials" });
    
    if (users[username]) {
        return res.status(400).json({ success: false, message: "This identity is already taken." });
    }

    users[username] = {
        username,
        password, 
        email: email || "",
        pfp: pfp || `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`,
        role: username.toLowerCase() === "developer" ? "Developer" : "Member",
        isOnline: true,
        lastSeen: Date.now(),
        bio: ""
    };
    
    res.json({ success: true, user: users[username] });
});

app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    const user = Object.values(users).find(u => u.username === identifier || u.email === identifier);
    
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    
    user.isOnline = true;
    user.lastSeen = Date.now();
    res.json({ success: true, user });
});

/**
 * MESSAGING ENGINE
 */
app.get('/api/messages', (req, res) => res.json(messages.slice(-100)));

app.post('/api/messages', async (req, res) => {
    const { username, text, role, pfp } = req.body;
    if (!username || !text) return res.status(400).send("Bad Request");

    if (users[username]) {
        users[username].isOnline = true;
        users[username].lastSeen = Date.now();
    }

    // Prevent recursive bot loops
    if (username === "System") return res.status(200).send("Bot loop prevented");

    const userMessage = {
        username,
        text,
        role: role || "Member",
        pfp: pfp || (users[username] ? users[username].pfp : null),
        timestamp: new Date().toISOString()
    };

    messages.push(userMessage);
    res.status(201).json(userMessage);

    // TRIGGER BOT (Responds if message starts with "system")
    if (text.toLowerCase().startsWith("system")) {
        const promptToAI = text.replace(/^system\s*/i, "");
        
        fetchAIResponse(promptToAI, messages).then(aiText => {
            const aiMessage = {
                username: "System",
                role: "Bot",
                pfp: users["System"].pfp,
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
 * USER MANAGEMENT & PROFILE UPDATES
 */
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        if (u.username !== "System") {
            // Mark offline if no heartbeat for 30 seconds
            u.isOnline = (now - u.lastSeen < 30000);
        }
        return { 
            username: u.username, 
            role: u.role, 
            pfp: u.pfp, 
            isOnline: u.isOnline,
            bio: u.bio
        };
    });
    res.json(userList);
});

app.put('/api/users/profile', (req, res) => {
    const { currentUsername, username, email, bio, profilePic } = req.body;
    const user = users[currentUsername];
    
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Handle Username Change logic
    if (username && username !== currentUsername) {
        if (users[username]) return res.status(400).json({ success: false, message: "New username taken" });
        
        users[username] = { 
            ...user, 
            username, 
            email: email || user.email, 
            bio: bio || user.bio, 
            pfp: profilePic || user.pfp 
        };
        
        // Rewrite message history for the new name
        messages = messages.map(msg => {
            if (msg.username === currentUsername) {
                return { ...msg, username: username, pfp: profilePic || user.pfp };
            }
            return msg;
        });

        delete users[currentUsername];
        return res.json({ success: true, user: users[username] });
    }

    // Normal profile update
    user.email = email || user.email;
    user.bio = bio || user.bio;
    user.pfp = profilePic || user.pfp;
    
    // Update avatar in current session messages
    messages = messages.map(msg => {
        if (msg.username === currentUsername) {
            return { ...msg, pfp: user.pfp };
        }
        return msg;
    });

    res.json({ success: true, user });
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
server.listen(PORT, () => console.log(`[NETWORK] AI-Terminal active on port ${PORT}`));
