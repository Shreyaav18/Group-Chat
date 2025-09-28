// server.js - Improved version with debug logging
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'group_chat'
};

let db;

console.log('🔧 Starting server...');
console.log('📊 Database config:', { ...dbConfig, password: '***' });

// Initialize database connection
async function initDB() {
  try {
    console.log('🔄 Connecting to database...');
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database');
    
    // Create tables if they don't exist
    await createTables();
    console.log('✅ Database tables ready');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('💡 Make sure MySQL is running and credentials are correct');
  }
}

// Create necessary tables
async function createTables() {
  try {
    const createGroupsTable = `
      CREATE TABLE IF NOT EXISTS groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT,
        sender_name VARCHAR(255) DEFAULT 'Anonymous',
        message TEXT NOT NULL,
        is_anonymous BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      )
    `;

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        avatar_color VARCHAR(7) DEFAULT '#4CAF50',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await db.execute(createGroupsTable);
    await db.execute(createMessagesTable);
    await db.execute(createUsersTable);

    // Insert default group if it doesn't exist
    const [groups] = await db.execute('SELECT * FROM user_groups WHERE name = ?', ['Fun Friday Group']);
    if (groups.length === 0) {
      await db.execute('INSERT INTO user_groups (name) VALUES (?)', ['Fun Friday Group']);
      console.log('✅ Created default group: Fun Friday Group');
    }

    // Show table info
    const [tables] = await db.execute('SHOW TABLES');
    console.log('📋 Available tables:', tables.map(t => Object.values(t)[0]));
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
}

// API Routes with better logging
app.get('/api/groups', async (req, res) => {
  console.log('📥 GET /api/groups');
  try {
    const [groups] = await db.execute('SELECT * FROM user_groups ORDER BY created_at DESC');
    console.log('✅ Retrieved groups:', groups.length);
    res.json(groups);
  } catch (error) {
    console.error('❌ Error fetching groups:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:id/messages', async (req, res) => {
  const { id } = req.params;
  console.log(`📥 GET /api/groups/${id}/messages`);
  try {
    const [messages] = await db.execute(
      'SELECT * FROM messages WHERE group_id = ? ORDER BY created_at ASC',
      [id]
    );
    console.log(`✅ Retrieved ${messages.length} messages for group ${id}`);
    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching messages:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { message, sender_name, is_anonymous } = req.body;
  console.log(`📤 POST /api/groups/${id}/messages`);
  console.log('📝 Message data:', { message, sender_name, is_anonymous });
  
  try {
    const [result] = await db.execute(
      'INSERT INTO messages (group_id, sender_name, message, is_anonymous) VALUES (?, ?, ?, ?)',
      [id, sender_name || 'Anonymous', message, is_anonymous || true]
    );

    const [newMessage] = await db.execute(
      'SELECT * FROM messages WHERE id = ?',
      [result.insertId]
    );

    console.log('✅ Message saved:', newMessage[0]);

    // Emit the message to all connected clients
    io.to(`group_${id}`).emit('new_message', newMessage[0]);
    console.log(`🔄 Broadcasted message to group_${id}`);
    
    res.json(newMessage[0]);
  } catch (error) {
    console.error('❌ Error saving message:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling with better logging
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`👥 User ${socket.id} joined group ${groupId}`);
  });

  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`👋 User ${socket.id} left group ${groupId}`);
  });

  socket.on('send_message', async (data) => {
    console.log('📨 Received message via socket:', data);
    try {
      const { groupId, message, senderName, isAnonymous } = data;
      
      const [result] = await db.execute(
        'INSERT INTO messages (group_id, sender_name, message, is_anonymous) VALUES (?, ?, ?, ?)',
        [groupId, senderName || 'Anonymous', message, isAnonymous || true]
      );

      const [newMessage] = await db.execute(
        'SELECT * FROM messages WHERE id = ?',
        [result.insertId]
      );

      console.log('✅ Socket message saved:', newMessage[0]);
      io.to(`group_${groupId}`).emit('new_message', newMessage[0]);
      console.log(`🔄 Broadcasted socket message to group_${groupId}`);
    } catch (error) {
      console.error('❌ Error handling socket message:', error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Add a test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'Server is running!', 
    timestamp: new Date().toISOString(),
    database: db ? 'Connected' : 'Not connected'
  });
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to view the app`);
    console.log(`🧪 Test server: http://localhost:${PORT}/api/test`);
  });
});