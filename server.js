const express = require('express');
const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// In-memory database for demo purposes
// In a real app, this would be a database
let users = {}; 

/**
 * Automates rank assignment based on username
 * @param {string} username 
 * @returns {string} Assigned Role
 */
function getAutomatedRole(username) {
    const name = username.toLowerCase().trim();
    if (name === 'developer') return 'Developer';
    if (name === 'joseee') return 'Owner';
    if (name === 'system') return 'Bot';
    return 'VIP'; // Everyone else
}

// Authentication / Heartbeat Endpoint
app.post('/api/auth/login', (req, res) => {
    const { identifier, password, pfp } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
    }

    // Determine the correct role based on the username provided
    const assignedRole = getAutomatedRole(identifier);

    // Update or Create user in the global directory
    users[identifier] = {
        username: identifier,
        password: password, // In production, never store/return plain text passwords
        role: assignedRole,
        pfp: pfp || users[identifier]?.pfp || '',
        lastSeen: Date.now(),
        isOnline: true
    };

    res.json({ 
        success: true, 
        user: { 
            username: identifier, 
            role: assignedRole,
            pfp: users[identifier].pfp
        } 
    });
});

// User Directory Endpoint
app.get('/api/users', (req, res) => {
    const now = Date.now();
    const userList = Object.values(users).map(u => {
        // A user is considered offline if no heartbeat in last 30 seconds
        const isOnline = (now - u.lastSeen) < 30000;
        return {
            username: u.username,
            role: u.role,
            pfp: u.pfp,
            isOnline: isOnline
        };
    });

    // Sort: Staff first, then alphabetical
    userList.sort((a, b) => {
        const priority = { 'Owner': 0, 'Developer': 1, 'Bot': 2, 'VIP': 3 };
        if (priority[a.role] !== priority[b.role]) {
            return priority[a.role] - priority[b.role];
        }
        return a.username.localeCompare(b.username);
    });

    res.json(userList);
});

app.listen(port, () => {
    console.log(`Chat server running at http://localhost:${port}`);
});
