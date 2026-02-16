const socket = io();

// Video Elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const loadingOverlay = document.getElementById('loading-overlay');

// Control Elements
const nextBtn = document.getElementById('next-btn');
const mobileChatBtn = document.getElementById('mobile-chat-btn');
const statusText = document.getElementById('status-text');

// Chat Elements (Desktop & Mobile)
const desktopChatBox = document.getElementById('desktop-chat-box');
const desktopInput = document.getElementById('msg-input');
const desktopSendBtn = document.getElementById('send-btn');

const mobileChatOverlay = document.getElementById('mobile-chat-box');
const mobileMessagesArea = document.getElementById('mobile-messages-area');
const mobileInput = document.getElementById('mobile-input');
const mobileSendBtn = document.getElementById('mobile-send');
const closeMobileChat = document.getElementById('close-mobile-chat');

let localStream;
let peerConnection;
let partnerId = null;

const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Initialize
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error(err);
        alert("Please allow camera access to use this app.");
    }
}
init();

// 2. Button Listeners
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

// Mobile Chat Toggles
mobileChatBtn.addEventListener('click', () => {
    mobileChatOverlay.style.display = 'flex';
});
closeMobileChat.addEventListener('click', () => {
    mobileChatOverlay.style.display = 'none';
});

// 3. Search Logic
function startSearch() {
    nextBtn.innerText = "Stop";
    statusText.innerText = "Searching...";
    loadingOverlay.innerText = "Looking for someone...";
    loadingOverlay.style.display = "flex";
    
    // Hide chat while searching
    toggleChatUI(false);
    
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
    
    toggleChatUI(false);
    addSystemMessage("You disconnected.");
}

// 4. Chat Logic (Syncs Desktop and Mobile)
function toggleChatUI(enable) {
    // Desktop
    desktopInput.disabled = !enable;
    desktopSendBtn.disabled = !enable;
    
    // Mobile
    if (enable) {
        mobileChatBtn.style.display = "block"; // Show chat button
    } else {
        mobileChatBtn.style.display = "none"; // Hide button
        mobileChatOverlay.style.display = "none"; // Close overlay
    }
}

// Sending Messages
function sendMessage(text) {
    if (text && partnerId) {
        addMessage(text, 'my-msg');
        socket.emit('send-message', text);
        desktopInput.value = '';
        mobileInput.value = '';
    }
}

// Desktop Inputs
desktopSendBtn.addEventListener('click', () => sendMessage(desktopInput.value.trim()));
desktopInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(desktopInput.value.trim()); });

// Mobile Inputs
mobileSendBtn.addEventListener('click', () => sendMessage(mobileInput.value.trim()));
mobileInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(mobileInput.value.trim()); });

// Receive Message
socket.on('receive-message', (msg) => {
    addMessage(msg, 'stranger-msg');
});

function addMessage(text, type) {
    // Add to Desktop
    const dDiv = document.createElement('div');
    dDiv.classList.add('message', type);
    dDiv.innerText = text;
    desktopChatBox.appendChild(dDiv);
    desktopChatBox.scrollTop = desktopChatBox.scrollHeight;

    // Add to Mobile
    const mDiv = document.createElement('div');
    mDiv.classList.add('message', type);
    mDiv.innerText = text;
    mobileMessagesArea.appendChild(mDiv);
    mobileMessagesArea.scrollTop = mobileMessagesArea.scrollHeight;
}

function addSystemMessage(text) {
    // Clear chat on new connection
    if (text.includes("Say Hi")) {
        desktopChatBox.innerHTML = '';
        mobileMessagesArea.innerHTML = '';
    }
    const div = document.createElement('div');
    div.classList.add('system-msg');
    div.innerText = text;
    desktopChatBox.appendChild(div);
}

// 5. Socket Events
socket.on('match-found', (id) => {
    partnerId = id;
    statusText.innerText = "Connected!";
    nextBtn.innerText = "Skip";
    loadingOverlay.style.display = "none";
    
    addSystemMessage("You are now chatting with a random stranger. Say Hi!");
    toggleChatUI(true); // Enable chat
    createPeerConnection();
});

socket.on('partner-disconnected', () => {
    statusText.innerText = "Stranger left";
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "Stranger disconnected";
    resetConnection();
    nextBtn.innerText = "Find New Stranger";
});

// 6. WebRTC (Standard)
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