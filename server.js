const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

let waitingUsers = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-partner", () => {
    if (waitingUsers.length > 0) {
      // Match found
      const partner = waitingUsers.pop();
      
      // Notify both users
      io.to(socket.id).emit("match-found", partner.id);
      io.to(partner.id).emit("match-found", socket.id);
      
      // Tell them who is initiating the call
      io.to(socket.id).emit("role", "caller");
      io.to(partner.id).emit("role", "callee");
    } else {
      // No one waiting, add to queue
      waitingUsers.push(socket);
    }
  });

  // Relay WebRTC signals (Offer, Answer, ICE Candidates)
  socket.on("signal", (data) => {
    io.to(data.target).emit("signal", {
      sender: socket.id,
      signal: data.signal
    });
  });

  socket.on("disconnect", () => {
    waitingUsers = waitingUsers.filter((user) => user.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});