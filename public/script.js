const socket = io();
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const nextBtn = document.getElementById('next-btn');
const statusText = document.getElementById('status-text');

let localStream;
let peerConnection;
let partnerId = null;
let isSearching = false;

// STUN servers
const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Initialize Camera
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error("Error accessing media devices.", err);
        statusText.innerText = "Please allow camera access.";
    }
}
init();

// 2. Button Logic (Start / Skip / Stop)
nextBtn.addEventListener('click', () => {
    if (nextBtn.innerText === "Start Chat" || nextBtn.innerText === "Find New Stranger") {
        startSearch();
    } else if (nextBtn.innerText === "Skip") {
        // Close current connection and search again immediately
        resetConnection();
        startSearch();
    } else if (nextBtn.innerText === "Stop") {
        // Stop searching
        stopSearch();
    }
});

function startSearch() {
    isSearching = true;
    nextBtn.innerText = "Stop"; // Allow user to cancel search
    statusText.innerText = "Looking for someone...";
    socket.emit('find-partner');
}

function stopSearch() {
    isSearching = false;
    socket.emit('stop-search'); // Tell server to remove us from queue
    nextBtn.innerText = "Start Chat";
    statusText.innerText = "Search stopped.";
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    partnerId = null;
    remoteVideo.srcObject = null; // Black out the screen
}

// 3. Socket Events
socket.on('match-found', (id) => {
    partnerId = id;
    statusText.innerText = "Stranger found!";
    nextBtn.innerText = "Skip"; // Change button to Skip
    createPeerConnection();
});

socket.on('partner-disconnected', () => {
    statusText.innerText = "Stranger disconnected.";
    resetConnection();
    nextBtn.innerText = "Find New Stranger"; // Prompt to search again
});

socket.on('role', async (role) => {
    if (role === 'caller') {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { type: 'offer', sdp: offer } });
    }
});

socket.on('signal', async (data) => {
    const signal = data.signal;
    if (!peerConnection) return; // Ignore signals if we reset

    if (signal.type === 'offer') {
        if (!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { target: data.sender, signal: { type: 'answer', sdp: answer } });
    } 
    else if (signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } 
    else if (signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

// 4. WebRTC Helper
function createPeerConnection() {
    if (peerConnection) return; // Prevent duplicates

    peerConnection = new RTCPeerConnection(servers);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && partnerId) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected') {
            resetConnection();
        }
    };
}