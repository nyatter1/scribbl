const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION ---
const MONGODB_URI = "mongodb+srv://hayden:123password123@cluster0.57lnswh.mongodb.net/vikvok_live?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3000;

// --- MONGODB CONNECTION ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('[DATABASE] Connected to MongoDB Atlas'))
    .catch(err => console.error('[DATABASE] Connection Error:', err));

// --- SCHEMAS & MODELS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: String,
    pfp: String,
    role: { type: String, default: 'Member' },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Number, default: Date.now },
    bio: { type: String, default: "" }
});

const messageSchema = new mongoose.Schema({
    username: String,
    text: String,
    role: String,
    pfp: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// --- MIDDLEWARE ---
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email, pfp } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Missing credentials" });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ success: false, message: "Username taken." });

        const newUser = new User({
            username,
            password,
            email: email || "",
            pfp: pfp || `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`,
            role: username.toLowerCase() === "developer" ? "Developer" : "Member",
            isOnline: true,
            lastSeen: Date.now()
        });

        await newUser.save();
        res.json({ success: true, user: newUser });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        user.isOnline = true;
        user.lastSeen = Date.now();
        await user.save();

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// --- MESSAGING ENGINE ---
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 }).limit(100);
        res.json(messages.reverse());
    } catch (err) {
        res.status(500).send("Error fetching messages");
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { username, text, role, pfp } = req.body;
        if (!username || !text) return res.status(400).send("Bad Request");

        // Update sender's status
        await User.findOneAndUpdate({ username }, { isOnline: true, lastSeen: Date.now() });

        const userMessage = new Message({
            username,
            text,
            role: role || "Member",
            pfp,
            timestamp: new Date().toISOString()
        });

        await userMessage.save();
        res.status(201).json(userMessage);

        // Simple Greeting Logic (Replaces the AI Bot)
        if (text.toLowerCase().includes("hello system")) {
            const systemReply = new Message({
                username: "System",
                role: "Bot",
                pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=System",
                text: `Hello ${username}!`,
                timestamp: new Date().toISOString()
            });
            await systemReply.save();
        }
    } catch (err) {
        res.status(500).send("Error saving message");
    }
});

// --- USER MANAGEMENT ---
app.get('/api/users', async (req, res) => {
    try {
        const now = Date.now();
        const allUsers = await User.find({}, 'username role pfp isOnline lastSeen bio');
        
        // Update online status in real-time based on lastSeen (30s threshold)
        const userList = allUsers.map(u => ({
            username: u.username,
            role: u.role,
            pfp: u.pfp,
            isOnline: (now - u.lastSeen < 30000),
            bio: u.bio
        }));
        
        res.json(userList);
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
});

app.put('/api/users/profile', async (req, res) => {
    try {
        const { currentUsername, username, email, bio, profilePic } = req.body;
        const user = await User.findOne({ username: currentUsername });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // If changing username
        if (username && username !== currentUsername) {
            const exists = await User.findOne({ username });
            if (exists) return res.status(400).json({ success: false, message: "New username taken" });
            
            user.username = username;
            // Update past messages
            await Message.updateMany({ username: currentUsername }, { username: username });
        }

        user.email = email || user.email;
        user.bio = bio || user.bio;
        user.pfp = profilePic || user.pfp;
        
        await user.save();
        // Sync avatars in message history
        await Message.updateMany({ username: user.username }, { pfp: user.pfp });

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: "Update failed" });
    }
});

app.post('/api/heartbeat', async (req, res) => {
    const { username } = req.body;
    await User.findOneAndUpdate({ username }, { isOnline: true, lastSeen: Date.now() });
    res.json({ success: true });
});

// --- CATCH-ALL ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`[NETWORK] Terminal active on port ${PORT}`));
