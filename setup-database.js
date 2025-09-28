// setup-database.js - Run this to set up your database
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
    console.log('🛠️ Setting up database...');
    
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    };

    let connection;

    try {
        // Connect to MySQL (without database)
        console.log('1️⃣ Connecting to MySQL server...');
        connection = await mysql.createConnection(config);
        console.log('✅ Connected to MySQL server');

        // Create database if it doesn't exist
        console.log('2️⃣ Creating database...');
        await connection.execute('CREATE DATABASE IF NOT EXISTS group_chat');
        console.log('✅ Database "group_chat" created/verified');

        // Close connection and reconnect to the specific database
        await connection.end();
        console.log('✅ Reconnecting to group_chat database...');
        
        connection = await mysql.createConnection({
            ...config,
            database: 'group_chat'
        });
        console.log('✅ Connected to group_chat database');

        // Create tables
        console.log('3️⃣ Creating tables...');
        
        // Groups table
        const createGroupsSQL = `CREATE TABLE IF NOT EXISTS groups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        await connection.execute(createGroupsSQL);
        console.log('✅ Groups table created');

        // Messages table  
        const createMessagesSQL = `CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id INT NOT NULL,
            sender_name VARCHAR(255) DEFAULT 'Anonymous',
            message TEXT NOT NULL,
            is_anonymous BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        await connection.execute(createMessagesSQL);
        console.log('✅ Messages table created');

        // Add indexes separately
        try {
            await connection.execute('CREATE INDEX idx_group_id ON messages (group_id)');
        } catch (e) {
            // Index might already exist, ignore error
        }
        
        try {
            await connection.execute('CREATE INDEX idx_created_at ON messages (created_at)');
        } catch (e) {
            // Index might already exist, ignore error
        }

        // Users table
        const createUsersSQL = `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            avatar_color VARCHAR(7) DEFAULT '#4CAF50',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        await connection.execute(createUsersSQL);
        console.log('✅ Users table created');

        // Insert default group
        console.log('4️⃣ Setting up default group...');
        const [groups] = await connection.execute('SELECT * FROM groups WHERE name = ?', ['Fun Friday Group']);
        
        if (groups.length === 0) {
            await connection.execute('INSERT INTO groups (name) VALUES (?)', ['Fun Friday Group']);
            console.log('✅ Default group "Fun Friday Group" created');
        } else {
            console.log('✅ Default group already exists');
        }

        // Insert some sample messages
        console.log('5️⃣ Adding sample messages...');
        const [existingMessages] = await connection.execute('SELECT COUNT(*) as count FROM messages');
        
        if (existingMessages[0].count === 0) {
            const sampleMessages = [
                { sender: 'Anonymous', message: 'Someone order Bornvita!!' },
                { sender: 'Anonymous', message: 'hahahahah!!' },
                { sender: 'Anonymous', message: "I'm Excited For this Event! Ho-Ho" },
                { sender: 'Anonymous', message: 'Hello!' },
                { sender: 'Anonymous', message: 'Yesssss!!!!!!!' },
                { sender: 'Abhay Shukla', message: 'We have Surprise For you!!' }
            ];

            for (const msg of sampleMessages) {
                await connection.execute(
                    'INSERT INTO messages (group_id, sender_name, message, is_anonymous) VALUES (?, ?, ?, ?)',
                    [1, msg.sender, msg.message, msg.sender === 'Anonymous']
                );
            }
            console.log('✅ Sample messages added');
        } else {
            console.log('✅ Messages already exist, skipping samples');
        }

        // Verify setup
        console.log('6️⃣ Verifying setup...');
        const [tables] = await connection.execute('SHOW TABLES');
        console.log('📋 Tables in database:', tables.map(t => Object.values(t)[0]));

        const [messageCount] = await connection.execute('SELECT COUNT(*) as count FROM messages');
        console.log(`📊 Total messages: ${messageCount[0].count}`);

        const [groupCount] = await connection.execute('SELECT COUNT(*) as count FROM groups');
        console.log(`👥 Total groups: ${groupCount[0].count}`);

        console.log('🎉 Database setup completed successfully!');
        console.log('💡 You can now run: npm start');

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.log('\n🔧 Troubleshooting tips:');
        console.log('1. Make sure MySQL is running');
        console.log('2. Check your .env file credentials');
        console.log('3. Try connecting manually: mysql -u root -p');
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('4. Your password might be wrong');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('4. MySQL server might not be running');
        }
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the setup
setupDatabase();