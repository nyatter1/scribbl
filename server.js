const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// 1. SERVE STATIC FILES
// This allows the browser to find index.html, login.html, etc.
app.use(express.static(path.join(__dirname))); 
// If your files are in a 'public' folder, use: app.use(express.static(path.join(__dirname, 'public')));

// --- MongoDB Configuration ---
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/terminal_chat";

mongoose.connect(MONGODB_URI)
  .then(() => console.log(">>> [SYSTEM] Database connection established."))
  .catch(err => {
    console.error(">>> [ERROR] Database connection failed:", err);
  });

// --- Database Schemas ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: String,
  password: { type: String, required: true },
  pfp: { type: String, default: "" },
  role: { type: String, default: "Member" },
  bio: { type: String, default: "No bio available." },
  isOnline: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, required: true },
  pfp: { type: String, default: "" },
  role: { type: String, default: "Member" },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// --- API Routes ---

/**
 * AUTH: Login
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    // Find by username or email
    const user = await User.findOne({ 
      $or: [{ username: identifier }, { email: identifier }],
      password: password // Note: In production, use bcrypt hashing
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    user.isOnline = true;
    user.lastSeen = Date.now();
    await user.save();

    // Greet the user with a system message
    const welcomeMsg = new Message({
      username: "System",
      text: `Hello ${user.username}, welcome back to the terminal.`,
      role: "System",
      pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=terminal"
    });
    await welcomeMsg.save();

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Auth failed" });
  }
});

/**
 * AUTH: Register
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, pfp } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: "Username taken" });

    const user = new User({ username, email, password, pfp });
    await user.save();

    // Initial greeting for new user
    const welcomeMsg = new Message({
      username: "System",
      text: `Hello ${username}, identity registered. Welcome to the network.`,
      role: "System",
      pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=terminal"
    });
    await welcomeMsg.save();

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

/**
 * MESSAGES: History
 */
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

/**
 * MESSAGES: Post
 */
app.post('/api/messages', async (req, res) => {
  try {
    const { username, text, pfp, role } = req.body;
    const msg = new Message({ username, text, pfp, role });
    await msg.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Post failed" });
  }
});

/**
 * USERS: List
 */
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Query failed" });
  }
});

/**
 * PROFILE: Update
 */
app.put('/api/users/profile', async (req, res) => {
  try {
    const { currentUsername, username, email, bio, profilePic } = req.body;
    const user = await User.findOneAndUpdate(
      { username: currentUsername },
      { username, email, bio, pfp: profilePic },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ success: false });

    // Update history
    await Message.updateMany({ username: currentUsername }, { username, pfp: profilePic });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 2. FALLBACK ROUTE
// This ensures that if you refresh on a specific path, it serves index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`>>> [SERVER] Running on port ${PORT}`);
});
