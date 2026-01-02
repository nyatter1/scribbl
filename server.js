const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Higher limit for PFP base64 strings
app.use(express.static('public'));

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chatapp';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'Member' },
    pfp: { type: String, default: '' },
    lastSeen: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

/**
 * AUTHENTICATION ENDPOINTS
 */

// Login / Heartbeat
app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const user = await User.findOne({ username: new RegExp(`^${identifier}$`, 'i') });

        if (user && user.password === password) {
            user.lastSeen = Date.now();
            await user.save();
            return res.json({ success: true, user });
        }
        res.status(401).json({ success: false, message: "Invalid credentials" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// Registration
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const existingUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists" });
        }

        const newUser = new User({
            username,
            password,
            role: "Member",
            lastSeen: Date.now(),
            pfp: ""
        });
        
        await newUser.save();
        res.json({ success: true, user: newUser });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error creating account" });
    }
});

/**
 * USER DIRECTORY ENDPOINTS
 */

// Get all users (sanitized for public view)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({});
        const sanitizedUsers = users.map(u => ({
            username: u.username,
            role: u.role,
            isOnline: (Date.now() - new Date(u.lastSeen).getTime()) < 30000, // Offline if no heartbeat for 30s
            pfp: u.pfp
        }));
        res.json(sanitizedUsers);
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching users" });
    }
});

/**
 * ADMIN ENDPOINTS
 */

// Update User Rank
app.put('/api/admin/rank', async (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    
    try {
        const admin = await User.findOne({ username: adminUsername });
        if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
            return res.status(403).json({ success: false, message: "Insufficient permissions" });
        }

        const target = await User.findOne({ username: targetUsername });
        if (target) {
            target.role = newRole;
            await target.save();
            return res.json({ success: true, message: `Rank updated for ${targetUsername}` });
        }
        
        res.status(404).json({ success: false, message: "Target user not found" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Rank update failed" });
    }
});

// Delete User
app.delete('/api/admin/users/:username', async (req, res) => {
    const adminUsername = req.query.adminUsername;
    const targetUsername = req.params.username;
    
    try {
        const admin = await User.findOne({ username: adminUsername });
        if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
            return res.status(403).json({ success: false, message: "Unauthorized purge" });
        }

        const result = await User.deleteOne({ username: new RegExp(`^${targetUsername}$`, 'i') });

        if (result.deletedCount > 0) {
            res.json({ success: true, message: "User purged from database" });
        } else {
            res.status(404).json({ success: false, message: "User not found" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Purge failed" });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`ChatApp Server running on port ${PORT}`);
});
