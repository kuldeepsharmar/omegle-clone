const socket = io();
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const findBtn = document.getElementById('find-btn');
const statusText = document.getElementById('status-text');

let localStream;
let peerConnection;
let partnerId = null;

// Free Google STUN servers (needed to connect different networks)
const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 1. Get User Media (Camera/Mic)
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

findBtn.addEventListener('click', () => {
    findBtn.disabled = true;
    findBtn.innerText = "Searching...";
    statusText.innerText = "Looking for someone...";
    socket.emit('find-partner');
});

// 2. Handle Socket Events
socket.on('match-found', (id) => {
    partnerId = id;
    statusText.innerText = "Partner found! Connecting...";
    createPeerConnection();
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

    if (!peerConnection) createPeerConnection();

    if (signal.type === 'offer') {
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

// 3. Helper: Create WebRTC Connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
}