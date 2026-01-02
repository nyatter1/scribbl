const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());

// Health Check for Render deployment
app.get('/', (req, res) => {
  res.send('Scribble.io Server is Running');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your GitHub Pages URL
    methods: ["GET", "POST"]
  }
});

const ROOM_CAPACITY = 2;
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomName, username, avatarColor }) => {
    let room = rooms.get(roomName);

    if (!room) {
      room = {
        name: roomName,
        players: [],
        gameState: 'waiting',
        canvasData: []
      };
      rooms.set(roomName, room);
    }

    // Check if player is already in room (prevent double joining on refresh)
    if (room.players.find(p => p.id === socket.id)) return;

    if (room.players.length >= ROOM_CAPACITY) {
      socket.emit('error_msg', 'Room is full!');
      return;
    }

    const newPlayer = {
      id: socket.id,
      username: username || 'Guest',
      avatarColor: avatarColor || '#6366f1',
      points: 0,
      isDrawing: false
    };

    room.players.push(newPlayer);
    socket.join(roomName);

    // Notify everyone in the room
    io.to(roomName).emit('room_update', room);

    // Start game if capacity reached (Max 2 people)
    if (room.players.length === ROOM_CAPACITY) {
      room.gameState = 'drawing';
      room.players[0].isDrawing = true; 
      
      io.to(roomName).emit('game_start', {
        drawerId: room.players[0].id,
        word: 'PENGUIN' // This should be randomized from a list
      });
      
      io.to(roomName).emit('receive_message', { 
        user: 'System', 
        msg: 'Room full! Starting game...', 
        type: 'system' 
      });
    }
  });

  socket.on('draw_event', ({ roomName, x, y, type, color, size }) => {
    // Broadcast to others in the room
    socket.to(roomName).emit('remote_draw', { x, y, type, color, size });
  });

  socket.on('send_message', ({ roomName, msg, username }) => {
    io.to(roomName).emit('receive_message', { user: username, msg, type: 'user' });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    rooms.forEach((room, roomName) => {
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        
        if (room.players.length === 0) {
          rooms.delete(roomName);
        } else {
          room.gameState = 'waiting';
          io.to(roomName).emit('room_update', room);
          io.to(roomName).emit('receive_message', { 
            user: 'System', 
            msg: 'Opponent left. Waiting for a new player...', 
            type: 'system' 
          });
        }
      }
    });
  });
});

// Use the port provided by Render or default to 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Scribble server running on port ${PORT}`);
});
