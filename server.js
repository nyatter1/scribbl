const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
// Default port or environment variable
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for base64 profile pics

// --- MongoDB Configuration ---
// Make sure to set MONGODB_URI in your environment variables
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/terminal_chat";

mongoose.connect(MONGODB_URI)
  .then(() => console.log(">>> [DATABASE] Connected to MongoDB Mainframe"))
  .catch(err => {
    console.error(">>> [DATABASE] Connection Error:", err);
    process.exit(1); // Exit if cannot connect to DB
  });

// --- Database Schemas ---

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  pfp: { type: String, default: "" },
  role: { type: String, default: "User" },
  bio: { type: String, default: "No bio available." },
  isOnline: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, required: true },
  pfp: { type: String, default: "" },
  role: { type: String, default: "User" },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// --- API Routes ---

/**
 * @route   POST /api/login
 * @desc    Handles user entry. If user doesn't exist, it creates one.
 */
app.post('/api/login', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username required" });

    let user = await User.findOne({ username });

    if (!user) {
      // Create new user profile
      user = new User({
        username,
        pfp: `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`,
        role: "New Recruit"
      });
      await user.save();
    } else {
      // Mark existing user as online
      user.isOnline = true;
      user.lastSeen = Date.now();
      await user.save();
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Authentication sequence failed" });
  }
});

/**
 * @route   GET /api/users
 * @desc    Fetch all registered users
 */
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ lastSeen: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to query directory" });
  }
});

/**
 * @route   GET /api/messages
 * @desc    Retrieve chat history
 */
app.get('/api/messages', async (req, res) => {
  try {
    // Return the last 150 messages for performance
    const messages = await Message.find().sort({ timestamp: 1 }).limit(150);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "History retrieval failed" });
  }
});

/**
 * @route   POST /api/messages
 * @desc    Broadcast a new message and check for system commands
 */
app.post('/api/messages', async (req, res) => {
  try {
    const { username, text, pfp, role } = req.body;
    
    // Save user message
    const newMessage = new Message({ username, text, pfp, role });
    await newMessage.save();

    // Basic System Logic (Bot Response)
    if (text.toLowerCase().includes('help')) {
      const botMsg = new Message({
        username: "Terminal-Bot",
        text: `Instructions for @${username}: Type /profile to edit details. Clear the console with CTRL+L.`,
        role: "System-AI",
        pfp: "https://api.dicebear.com/7.x/bottts/svg?seed=system"
      });
      await botMsg.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Transmission failed" });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Updates user details and synchronizes them across all past messages
 */
app.put('/api/users/profile', async (req, res) => {
  try {
    const { currentUsername, newUsername, bio, pfp } = req.body;

    // 1. Update the User profile
    const updatedUser = await User.findOneAndUpdate(
      { username: currentUsername },
      { username: newUsername, bio, pfp },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 2. Cascade update: Change all historical messages to reflect new info
    await Message.updateMany(
      { username: currentUsername },
      { username: newUsername, pfp: pfp }
    );

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ success: false, message: "Profile synchronization failed" });
  }
});

/**
 * @route   POST /api/logout
 * @desc    Updates online status
 */
app.post('/api/logout', async (req, res) => {
  try {
    const { username } = req.body;
    await User.findOneAndUpdate({ username }, { isOnline: false, lastSeen: Date.now() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Logout sequence incomplete" });
  }
});

// Start the Engines
app.listen(PORT, () => {
  console.log(`>>> [SERVER] Terminal Online at http://localhost:${PORT}`);
});
