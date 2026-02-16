const socket = io();
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const nextBtn = document.getElementById('next-btn');
const statusText = document.getElementById('status-text');
const loadingOverlay = document.getElementById('loading-overlay');

// Chat Elements
const chatBox = document.getElementById('chat-box');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

let localStream;
let peerConnection;
let partnerId = null;

const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Camera Init
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error(err);
        statusText.innerText = "Allow camera to start";
    }
}
init();

// 2. Buttons
nextBtn.addEventListener('click', () => {
    const action = nextBtn.innerText;
    
    if (action === "Start Chat" || action === "Find New Stranger") {
        startSearch();
    } else if (action === "Skip") {
        resetConnection();
        startSearch();
    } else if (action === "Stop") {
        stopSearch();
    }
});

function startSearch() {
    nextBtn.innerText = "Stop";
    statusText.innerText = "Searching...";
    loadingOverlay.innerText = "Looking for someone...";
    loadingOverlay.style.display = "flex";
    socket.emit('find-partner');
}

function stopSearch() {
    socket.emit('stop-search');
    nextBtn.innerText = "Start Chat";
    statusText.innerText = "Stopped";
    loadingOverlay.innerText = "Click Start";
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    partnerId = null;
    remoteVideo.srcObject = null;
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "Disconnected";
    
    // Disable Chat
    toggleChat(false);
    addSystemMessage("You disconnected.");
}

// 3. Socket Events
socket.on('match-found', (id) => {
    partnerId = id;
    statusText.innerText = "Connected to Stranger";
    nextBtn.innerText = "Skip";
    loadingOverlay.style.display = "none";
    
    // Enable Chat & Clear old messages
    chatBox.innerHTML = ''; 
    addSystemMessage("You are now chatting with a random stranger. Say Hi!");
    toggleChat(true);

    createPeerConnection();
});

socket.on('partner-disconnected', () => {
    statusText.innerText = "Stranger left";
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "Stranger disconnected";
    resetConnection();
    nextBtn.innerText = "Find New Stranger";
});

// --- CHAT LOGIC ---

function toggleChat(enable) {
    msgInput.disabled = !enable;
    sendBtn.disabled = !enable;
    if (enable) msgInput.focus();
}

// Send Message
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = msgInput.value.trim();
    if (text && partnerId) {
        // Show my message
        addMessage(text, 'my-msg');
        // Send to server
        socket.emit('send-message', text);
        msgInput.value = '';
    }
}

// Receive Message
socket.on('receive-message', (msg) => {
    addMessage(msg, 'stranger-msg');
});

function addMessage(text, type) {
    const div = document.createElement('div');
    div.classList.add('message', type);
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll down
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('system-msg');
    div.innerText = text;
    chatBox.appendChild(div);
}

// --- WEBRTC LOGIC ---

socket.on('role', async (role) => {
    if (role === 'caller') {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { type: 'offer', sdp: offer } });
    }
});

socket.on('signal', async (data) => {
    const signal = data.signal;
    if (!peerConnection) return;

    if (signal.type === 'offer') {
        if (!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { target: data.sender, signal: { type: 'answer', sdp: answer } });
    } else if (signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

function createPeerConnection() {
    if (peerConnection) return;
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
    
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected') {
            resetConnection();
        }
    };
}