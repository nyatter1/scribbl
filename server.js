const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    updateDoc, 
    query 
} = require('firebase/firestore');

// --- Configuration ---
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Environment Variables provided by Canvas
const firebaseConfig = JSON.parse(process.env.__firebase_config || '{}');
const appId = process.env.__app_id || 'default-app-id';

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// --- Firestore Path Helpers ---
// Using RULE 1: /artifacts/{appId}/public/data/{collectionName}
const getUsersCol = () => collection(db, 'artifacts', appId, 'public', 'data', 'users');

// In-memory active presence (for real-time performance)
const activeSessions = new Map();

// --- Auth & Data Logic ---

/**
 * Register or Login User
 * Saves data to Firestore to persist between server restarts
 */
const authenticateUser = async (username, password) => {
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', username);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        // Check password
        if (userData.password === password) {
            return userData;
        } else {
            throw new Error("Invalid password");
        }
    } else {
        // Create new user if they don't exist
        const newUser = {
            username,
            password,
            userId: crypto.randomUUID(),
            rank: 'Member',
            createdAt: Date.now(),
            lastSeen: Date.now()
        };
        await setDoc(userDocRef, newUser);
        return newUser;
    }
};

const broadcastOnlineList = async () => {
    // We send back all active sessions
    const list = Array.from(activeSessions.values());
    io.emit('update-online-list', list);
};

// --- Socket Events ---

io.on('connection', (socket) => {
    
    socket.on('login', async ({ username, password }) => {
        try {
            const user = await authenticateUser(username, password);
            
            // Mark as active
            const sessionData = {
                socketId: socket.id,
                ...user,
                status: 'online',
                lastSeen: Date.now()
            };
            
            activeSessions.set(socket.id, sessionData);
            
            // Persist lastSeen to DB
            const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', username);
            await updateDoc(userDocRef, { lastSeen: Date.now() });

            socket.emit('login-success', user);
            broadcastOnlineList();
            
            console.log(`${username} is online.`);
        } catch (err) {
            socket.emit('login-error', { message: err.message });
        }
    });

    socket.on('heartbeat', () => {
        if (activeSessions.has(socket.id)) {
            const session = activeSessions.get(socket.id);
            session.lastSeen = Date.now();
            activeSessions.set(socket.id, session);
        }
    });

    socket.on('disconnect', () => {
        if (activeSessions.has(socket.id)) {
            const user = activeSessions.get(socket.id);
            activeSessions.delete(socket.id);
            broadcastOnlineList();
            console.log(`${user.username} left.`);
        }
    });
});

// Periodic Cleanup for "Ghost" users
setInterval(() => {
    const now = Date.now();
    let changed = false;
    activeSessions.forEach((session, socketId) => {
        if (now - session.lastSeen > 45000) { // 45 seconds timeout
            activeSessions.delete(socketId);
            changed = true;
        }
    });
    if (changed) broadcastOnlineList();
}, 15000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with Firestore persistence`);
});
