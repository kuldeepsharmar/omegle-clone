const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

let waitingUsers = [];
let peers = {}; // Track who is talking to whom

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-partner", () => {
    // If user is already in a chat, disconnect them first
    if (peers[socket.id]) {
      const partnerId = peers[socket.id];
      io.to(partnerId).emit("partner-disconnected");
      delete peers[partnerId];
      delete peers[socket.id];
    }

    if (waitingUsers.length > 0) {
      // Match found
      const partner = waitingUsers.pop();

      // Check if partner is still connected
      if (!io.sockets.sockets.get(partner.id)) {
        // If partner disconnected while waiting, try again (recursive)
        return socket.emit("find-partner"); 
      }
      
      // Store the connection
      peers[socket.id] = partner.id;
      peers[partner.id] = socket.id;
      
      // Notify both users
      io.to(socket.id).emit("match-found", partner.id);
      io.to(partner.id).emit("match-found", socket.id);
      
      // Assign roles
      io.to(socket.id).emit("role", "caller");
      io.to(partner.id).emit("role", "callee");
    } else {
      // No match yet, add to queue
      waitingUsers.push(socket);
    }
  });

  // Relay WebRTC signals
  socket.on("signal", (data) => {
    io.to(data.target).emit("signal", {
      sender: socket.id,
      signal: data.signal
    });
  });

  // Handle Disconnect/Skip
  const handleDisconnect = () => {
    // Remove from waiting list if they were waiting
    waitingUsers = waitingUsers.filter((user) => user.id !== socket.id);

    // If they were in a call, notify the partner
    if (peers[socket.id]) {
      const partnerId = peers[socket.id];
      io.to(partnerId).emit("partner-disconnected");
      delete peers[partnerId];
      delete peers[socket.id];
    }
  };

  socket.on("disconnect", handleDisconnect);
  socket.on("stop-search", handleDisconnect); // Custom event for skipping
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});