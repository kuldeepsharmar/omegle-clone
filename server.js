const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

let waitingUsers = [];
let peers = {}; // Tracks who is talking to whom: { socketId: partnerSocketId }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 1. Find Partner Logic
  socket.on("find-partner", () => {
    // If user is already in a chat, disconnect them from the old partner first
    if (peers[socket.id]) {
      const partnerId = peers[socket.id];
      io.to(partnerId).emit("partner-disconnected");
      delete peers[partnerId];
      delete peers[socket.id];
    }

    if (waitingUsers.length > 0) {
      // Match found in the queue
      const partner = waitingUsers.pop();

      // Check if the partner is still connected (edge case)
      if (!io.sockets.sockets.get(partner.id)) {
        // If partner disconnected while waiting, try again (recursive)
        return socket.emit("find-partner"); 
      }
      
      // Store the connection link
      peers[socket.id] = partner.id;
      peers[partner.id] = socket.id;
      
      // Notify both users about the match
      io.to(socket.id).emit("match-found", partner.id);
      io.to(partner.id).emit("match-found", socket.id);
      
      // Assign roles (Caller initiates the WebRTC offer)
      io.to(socket.id).emit("role", "caller");
      io.to(partner.id).emit("role", "callee");

    } else {
      // No one is waiting, add this user to the queue
      waitingUsers.push(socket);
    }
  });

  // 2. Relay WebRTC Signals (Video/Audio Handshake)
  socket.on("signal", (data) => {
    // Only send signal if we have a valid target
    io.to(data.target).emit("signal", {
      sender: socket.id,
      signal: data.signal
    });
  });

  // 3. Relay Text Chat Messages
  socket.on("send-message", (message) => {
    const partnerId = peers[socket.id];
    if (partnerId) {
      io.to(partnerId).emit("receive-message", message);
    }
  });

  // 4. Handle Disconnect or Stop Search
  const handleDisconnect = () => {
    // Remove from waiting list if they were waiting
    waitingUsers = waitingUsers.filter((user) => user.id !== socket.id);

    // If they were in a call, notify the partner
    if (peers[socket.id]) {
      const partnerId = peers[socket.id];
      io.to(partnerId).emit("partner-disconnected");
      
      // Clean up the peer tracking
      delete peers[partnerId];
      delete peers[socket.id];
    }
  };

  socket.on("disconnect", handleDisconnect);
  socket.on("stop-search", handleDisconnect); // Custom event when user clicks "Stop"
});

// Start the server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});