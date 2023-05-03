
require('dotenv').config();
const express = require('express');

const { Pool } = require('pg');

const pgUser = process.env.PG_USER;
const pgPass = process.env.PG_PASS;
const serverLoc = process.env.PG_SERVER;
const dbName = process.env.DB_NAME;
const connString = 'tcp://'+pgUser+':'+pgPass+'@'+serverLoc+':5432/'+dbName;   //username:password@location:port/dbname

var app = express();

var server = app.listen(3000);

var io = require('socket.io',{cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["content-type"]
}})(server);


//Try to connect to database
const pool = new Pool({
    connectionString: connString
});
//Check if connection is good or bad
pool.connect(err => {
    if(err) {
        console.error('Database connection error', err.stack);
    }
    else {
        console.log('Connected');
    }
})

//io = to all clients
//socket = to specific client
io.on('connection', function(socket) {
  console.log('a user connected');

  // Handle joining a conversation
  socket.on('join conversation', ({ conversation_id }) => {
    console.log(`user joined conversation ${conversation_id}`)
    socket.join(conversation_id);
  });

  // Handle chat messages
  socket.on('chat message', async ({ conversation_id, sender_id, content }) => {
    // Store the message in the database
    try {
      const client = await pool.connect();
      const result = await client.query(
        `INSERT INTO chat_message(conversation_id, sender_id, content) 
        VALUES ($1, $2, $3) RETURNING id, sent_at`,
        [conversation_id, sender_id, content]
      );
      const message_id = result.rows[0].id;
      const sent_at = result.rows[0].sent_at;
      client.release();

      // Broadcast the message to all conversation participants (except the sender)
      io.to(conversation_id).emit('chat message', {message_id,conversation_id, sender_id, content, sent_at });
        
    } catch (err) {
      console.error(err);
    }
  });
  socket.on('get messages', (data) => {
    const { conversation_id } = data;

    // Retrieve all messages for the conversation from the 'Message' table
    pool.query(
      `SELECT * FROM chat_message
       WHERE conversation_id = $1
       ORDER BY sent_at DESC`,
      [conversation_id],
      (err, result) => {
        if (err) {
          console.error('Error retrieving messages:', err);
        } else {
          const messages = result.rows;
          // Emit the messages to the client
          socket.emit('messages', messages);
        }
      }
    );
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

    
})

