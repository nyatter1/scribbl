const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory database (reset on server restart)
// In a production environment, this would be replaced with Firestore or MongoDB
let users = [
    { username: 'System', password: 'password', role: 'Owner', isOnline: true, lastActive: Date.now(), pfp: '' }
];

// Helper: Check if user is online based on heartbeat (30 second timeout)
function getOnlineUsers() {
    const now = Date.now();
    return users.map(u => ({
        ...u,
        isOnline: (now - u.lastActive) < 30000 
    }));
}

// API: Authentication / Login / Heartbeat
app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    
    let user = users.find(u => u.username === identifier);
    
    if (user) {
        if (user.password === password) {
            user.lastActive = Date.now();
            return res.json({ success: true, user });
        } else {
            return res.status(401).json({ success: false, message: "Invalid password." });
        }
    } else {
        // Simple auto-registration for demo purposes
        const newUser = {
            username: identifier,
            password: password,
            role: 'Member',
            lastActive: Date.now(),
            pfp: ''
        };
        users.push(newUser);
        return res.json({ success: true, user: newUser });
    }
});

// API: Get All Users (with online status)
app.get('/api/users', (req, res) => {
    res.json(getOnlineUsers().map(u => ({
        username: u.username,
        role: u.role,
        isOnline: u.isOnline,
        pfp: u.pfp
    })));
});

// API: Update Rank (Admin Only)
app.put('/api/admin/rank', (req, res) => {
    const { adminUsername, targetUsername, newRole } = req.body;
    
    const admin = users.find(u => u.username === adminUsername);
    if (!admin || (admin.role !== 'Owner' && admin.role !== 'Developer')) {
        return res.status(403).json({ success: false, message: "Forbidden: Admin access required." });
    }

    const target = users.find(u => u.username === targetUsername);
    if (!target) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    target.role = newRole;
    res.json({ success: true, message: `Rank of ${targetUsername} updated to ${newRole}.` });
});

// API: Delete User (Admin Only)
app.delete('/api/admin/users/:username', (req, res) => {
    const adminUsername = req.query.adminUsername;
    const targetUsername = req.params.username;

    const admin = users.find(u => u.username === adminUsername);
    if (!admin || (admin.role !== 'Owner' && admin.role !== 'Developer')) {
        return res.status(403).json({ success: false, message: "Forbidden." });
    }

    const index = users.findIndex(u => u.username === targetUsername);
    if (index !== -1) {
        users.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Chat Server running on port ${PORT}`);
});
