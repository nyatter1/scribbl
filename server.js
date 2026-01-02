const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');

/**
 * CONFIGURATION & INITIALIZATION
 */
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/terminal_chat";

/**
 * MIDDLEWARE
 */
// Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(path.join(__dirname)));
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Custom Logger Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

/**
 * DATABASE CONNECTION
 */
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log("==========================================");
        console.log(">>> [DATABASE] Connected to MongoDB");
        console.log(`>>> [URI] ${MONGODB_URI}`);
        console.log("==========================================");
    })
    .catch(err => {
        console.error(">>> [CRITICAL] MongoDB Connection Error:", err);
        process.exit(1);
    });

/**
 * SCHEMAS & MODELS
 */
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    pfp: { type: String, default: "https://api.dicebear.com/7.x/pixel-art/svg" },
    role: { type: String, default: "Member" },
    bio: { type: String, default: "New terminal user." },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    pfp: { type: String, default: "" },
    role: { type: String, default: "Member" },
    timestamp: { type: Date, default: Date.now },
    isSystem: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

/**
 * API ROUTES - AUTHENTICATION
 */

// LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        
        // Find by username or email
        const user = await User.findOne({
            $or: [{ username: identifier }, { email: identifier }]
        });

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        // Update online status
        user.isOnline = true;
        user.lastSeen = Date.now();
        await user.save();

        // LOGIC: Hello {user} Greeting
        const welcomeMessage = new Message({
            username: "SYSTEM",
            text: `User [${user.username}] has reconnected. Hello ${user.username}!`,
            role: "System",
            pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=terminal",
            isSystem: true
        });
        await welcomeMessage.save();

        res.json({ success: true, user: {
            username: user.username,
            email: user.email,
            pfp: user.pfp,
            role: user.role,
            bio: user.bio
        }});
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

// REGISTER ROUTE
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, pfp } = req.body;

        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists." });
        }

        const newUser = new User({ username, email, password, pfp });
        await newUser.save();

        // Initial Greeting
        const welcomeMessage = new Message({
            username: "SYSTEM",
            text: `Hello ${username}, identity established. Access granted to the mainframe.`,
            role: "System",
            isSystem: true
        });
        await welcomeMessage.save();

        res.json({ success: true, message: "Account created successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Registration failed." });
    }
});

/**
 * API ROUTES - MESSAGING
 */

// GET MESSAGES
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 }).limit(50);
        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch messages." });
    }
});

// POST MESSAGE
app.post('/api/messages', async (req, res) => {
    try {
        const { username, text, pfp, role } = req.body;
        const newMessage = new Message({ username, text, pfp, role });
        await newMessage.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to send message." });
    }
});

/**
 * API ROUTES - USER MANAGEMENT
 */

// GET ALL USERS (Online list)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username pfp role isOnline');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users." });
    }
});

// UPDATE PROFILE
app.put('/api/users/profile', async (req, res) => {
    try {
        const { currentUsername, username, email, bio, profilePic } = req.body;
        
        const updatedUser = await User.findOneAndUpdate(
            { username: currentUsername },
            { username, email, bio, pfp: profilePic },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ success: false });

        // Update message history to reflect new profile info
        await Message.updateMany(
            { username: currentUsername },
            { username: username, pfp: profilePic }
        );

        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/**
 * SERVER STATIC FILE HANDLING (Fixes "Cannot GET /index.html")
 */

// Serve index.html for all non-API routes (Single Page Application support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * ERROR HANDLING
 */
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke inside the terminal!');
});

/**
 * START SERVER
 */
server.listen(PORT, () => {
    console.log(`>>> [SERVER] Node.js process: ${process.pid}`);
    console.log(`>>> [SERVER] Listening on http://localhost:${PORT}`);
    console.log(">>> [STATUS] Systems operational.");
});
