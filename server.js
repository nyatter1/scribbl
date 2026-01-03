const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- CONFIGURATION ---
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://hayden:123password123@cluster0.57lnswh.mongodb.net/vikvok_live?retryWrites=true&w=majority";
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
    timestamp: { type: Date, default: Date.now },
    isSecret: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// --- MIDDLEWARE ---
app.use(cors());
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
            role: (username.toLowerCase() === "developer" || username.toLowerCase() === "hayden") ? "Developer" : "Member",
            isOnline: true,
            lastSeen: Date.now()
        });

        await newUser.save();
        const userObj = newUser.toObject();
        delete userObj.password;
        res.json({ success: true, user: userObj });
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

        const userObj = user.toObject();
        delete userObj.password;
        res.json({ success: true, user: userObj });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// --- USER PROFILE ROUTES ---
app.put('/api/users/profile', async (req, res) => {
    try {
        const { currentUsername, username, email, bio, profilePic } = req.body;
        const updateData = {};
        if (username) updateData.username = username;
        if (email) updateData.email = email;
        if (bio !== undefined) updateData.bio = bio;
        if (profilePic) updateData.pfp = profilePic;

        const updatedUser = await User.findOneAndUpdate(
            { username: currentUsername },
            updateData,
            { new: true }
        ).select('-password');

        if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- ADMIN API ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (err) {
        res.status(500).send("Error fetching users");
    }
});

app.put('/api/admin/rank', async (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    try {
        const admin = await User.findOne({ username: adminUsername });
        if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
            return res.status(403).json({ success: false, message: "Clearance Level Insufficient" });
        }

        const updated = await User.findOneAndUpdate(
            { username: targetUsername }, 
            { role: newRole }, 
            { new: true }
        ).select('-password');
        
        io.emit('user_updated', updated);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/admin/users/:username', async (req, res) => {
    const { adminUsername } = req.query;
    const { username } = req.params;
    try {
        const admin = await User.findOne({ username: adminUsername });
        if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
            return res.status(403).send("Unauthorized");
        }
        await User.findOneAndDelete({ username });
        await Message.deleteMany({ username });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- SOCKET.IO REAL-TIME ENGINE ---
let activeConnections = new Map();

io.on('connection', (socket) => {
    socket.on('join', async (userData) => {
        if (!userData || !userData.username) return;
        
        const user = await User.findOneAndUpdate(
            { username: userData.username },
            { isOnline: true, lastSeen: Date.now() },
            { new: true }
        );

        if (user) {
            const publicUser = {
                id: socket.id,
                username: user.username,
                role: user.role,
                pfp: user.pfp,
                bio: user.bio,
                isOnline: true
            };
            activeConnections.set(socket.id, publicUser);

            const history = await Message.find({ isSecret: false }).sort({ timestamp: -1 }).limit(50);
            socket.emit('init_data', {
                history: history.reverse(),
                users: Array.from(activeConnections.values())
            });

            socket.broadcast.emit('user_joined', publicUser);
        }
    });

    socket.on('send_message', async (msgData) => {
        const user = activeConnections.get(socket.id);
        if (!user) return;

        const newMessage = new Message({
            username: user.username,
            role: user.role,
            pfp: user.pfp,
            text: msgData.text,
            isSecret: msgData.isSecret || false
        });

        await newMessage.save();
        io.emit('new_message', newMessage);
    });

    socket.on('dev_command', async (data) => {
        const user = activeConnections.get(socket.id);
        if (!user || (user.role !== 'Developer' && user.role !== 'Owner')) {
            return socket.emit('terminal_response', { text: "Access Denied", color: "text-red-500" });
        }

        const { command } = data;
        if (command === 'clear') {
            await Message.deleteMany({ isSecret: false });
            io.emit('clear_chat');
            socket.emit('terminal_response', { text: "Chat history wiped.", color: "text-emerald-500" });
        }
    });

    socket.on('disconnect', async () => {
        const user = activeConnections.get(socket.id);
        if (user) {
            await User.findOneAndUpdate({ username: user.username }, { isOnline: false, lastSeen: Date.now() });
            activeConnections.delete(socket.id);
            io.emit('user_left', socket.id);
        }
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`[SYSTEM] Node running on port ${PORT}`));
