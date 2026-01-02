const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Higher limit for PFP base64 strings
app.use(express.static('public'));

/**
 * Mock Database State
 * In a production environment, this would be handled by MongoDB/Mongoose.
 */
let users = [
    { 
        username: "Core_Developer", 
        password: "admin_password", 
        role: "Developer", 
        isOnline: true, 
        lastSeen: Date.now(),
        pfp: "" 
    }
];

// Helper to find user
const findUser = (username) => users.find(u => u.username.toLowerCase() === username.toLowerCase());

/**
 * AUTHENTICATION ENDPOINTS
 */

// Login / Heartbeat
app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    const user = findUser(identifier);

    if (user && user.password === password) {
        user.isOnline = true;
        user.lastSeen = Date.now();
        return res.json({ success: true, user });
    }
    res.status(401).json({ success: false, message: "Invalid credentials" });
});

// Registration
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    
    if (findUser(username)) {
        return res.status(400).json({ success: false, message: "Username already exists" });
    }

    const newUser = {
        username,
        password,
        role: "Member",
        isOnline: true,
        lastSeen: Date.now(),
        pfp: ""
    };
    
    users.push(newUser);
    res.json({ success: true, user: newUser });
});

/**
 * USER DIRECTORY ENDPOINTS
 */

// Get all users (sanitized for public view)
app.get('/api/users', (req, res) => {
    const sanitizedUsers = users.map(u => ({
        username: u.username,
        role: u.role,
        isOnline: (Date.now() - u.lastSeen) < 30000, // Offline if no heartbeat for 30s
        pfp: u.pfp
    }));
    res.json(sanitizedUsers);
});

/**
 * ADMIN ENDPOINTS
 */

// Update User Rank
app.put('/api/admin/rank', (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    
    const admin = findUser(adminUsername);
    const target = findUser(targetUsername);

    if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    if (target) {
        target.role = newRole;
        return res.json({ success: true, message: `Rank updated for ${targetUsername}` });
    }
    
    res.status(404).json({ success: false, message: "Target user not found" });
});

// Delete User
app.delete('/api/admin/users/:username', (req, res) => {
    const adminUsername = req.query.adminUsername;
    const targetUsername = req.params.username;
    
    const admin = findUser(adminUsername);
    if (!admin || (admin.role !== 'Developer' && admin.role !== 'Owner')) {
        return res.status(403).json({ success: false, message: "Unauthorized purge" });
    }

    const initialLength = users.length;
    users = users.filter(u => u.username.toLowerCase() !== targetUsername.toLowerCase());

    if (users.length < initialLength) {
        res.json({ success: true, message: "User purged from database" });
    } else {
        res.status(404).json({ success: false, message: "User not found" });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`ChatApp Server running on port ${PORT}`);
});
