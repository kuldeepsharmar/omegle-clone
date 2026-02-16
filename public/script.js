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

// Public STUN servers
const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Initialize Camera
async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error("Camera Error:", err);
        alert("Camera access denied. Please allow permissions and refresh.");
        statusText.innerText = "Camera access denied.";
    }
}
init();

// 2. Button Listeners
nextBtn.addEventListener('click', () => {
    // Check if socket is connected
    if (!socket.connected) {
        alert("Connecting to server... Please wait.");
        return;
    }

    const action = nextBtn.innerText;
    if (action === "Start" || action === "Find New Stranger") {
        startSearch();
    } else if (action === "Skip") {
        skipPartner();
    } else if (action === "Stop") {
        stopSearch();
    }
});

// Mobile Chat Toggles
if (mobileChatBtn) {
    mobileChatBtn.addEventListener('click', () => {
        mobileChatOverlay.style.display = 'flex';
    });
}
if (closeMobileChat) {
    closeMobileChat.addEventListener('click', () => {
        mobileChatOverlay.style.display = 'none';
    });
}

// 3. Search Logic
function startSearch() {
    console.log("Starting search...");
    nextBtn.innerText = "Stop";
    statusText.innerText = "Searching...";
    loadingOverlay.innerText = "Looking for someone...";
    loadingOverlay.style.display = "flex";
    
    toggleChatUI(false);
    socket.emit('find-partner');
}

function stopSearch() {
    socket.emit('stop-search');
    nextBtn.innerText = "Start";
    statusText.innerText = "Stopped";
    loadingOverlay.innerText = "Click Start";
}

function skipPartner() {
    resetConnection();
    startSearch();
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

// 4. Chat Logic
function toggleChatUI(enable) {
    desktopInput.disabled = !enable;
    desktopSendBtn.disabled = !enable;
    
    if (enable) {
        if(mobileChatBtn) mobileChatBtn.style.display = "block";
    } else {
        if(mobileChatBtn) mobileChatBtn.style.display = "none";
        if(mobileChatOverlay) mobileChatOverlay.style.display = "none";
    }
}

function sendMessage(text) {
    if (text && partnerId) {
        addMessage(text, 'my-msg');
        socket.emit('send-message', text);
        desktopInput.value = '';
        if(mobileInput) mobileInput.value = '';
    }
}

desktopSendBtn.addEventListener('click', () => sendMessage(desktopInput.value.trim()));
desktopInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(desktopInput.value.trim()); });

if (mobileSendBtn) {
    mobileSendBtn.addEventListener('click', () => sendMessage(mobileInput.value.trim()));
    mobileInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(mobileInput.value.trim()); });
}

socket.on('receive-message', (msg) => {
    addMessage(msg, 'stranger-msg');
});

function addMessage(text, type) {
    // Desktop
    const dDiv = document.createElement('div');
    dDiv.classList.add('message', type);
    dDiv.innerText = text;
    desktopChatBox.appendChild(dDiv);
    desktopChatBox.scrollTop = desktopChatBox.scrollHeight;

    // Mobile
    const mDiv = document.createElement('div');
    mDiv.classList.add('message', type);
    mDiv.innerText = text;
    mobileMessagesArea.appendChild(mDiv);
    mobileMessagesArea.scrollTop = mobileMessagesArea.scrollHeight;
}

function addSystemMessage(text) {
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
socket.on('connect', () => {
    console.log("Connected to server");
    statusText.innerText = "Click Start";
});

socket.on('match-found', (id) => {
    console.log("Match found:", id);
    partnerId = id;
    statusText.innerText = "Connected!";
    nextBtn.innerText = "Skip";
    loadingOverlay.style.display = "none";
    
    addSystemMessage("You are now chatting with a random stranger. Say Hi!");
    toggleChatUI(true);
    createPeerConnection();
});

socket.on('partner-disconnected', () => {
    statusText.innerText = "Stranger left";
    loadingOverlay.style.display = "flex";
    loadingOverlay.innerText = "Stranger disconnected";
    resetConnection();
    nextBtn.innerText = "Find New Stranger"; // Updates button text
});

// 6. WebRTC
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