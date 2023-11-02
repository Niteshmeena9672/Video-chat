const APP_ID = "2bc737df871f4988add71d7d74fe2551"

// Check if a user ID ('uid') exists in the session storage.
let uid = sessionStorage.getItem('uid');

// If 'uid' doesn't exist (null or undefined), generate a random number and store it in the session storage.
if (!uid) {
    uid = String(Math.floor(Math.random() * 10000)); // Generate a random number between 0 and 9999.
    sessionStorage.setItem('uid', uid); // Store the generated 'uid' in session storage.
}

// Initialize variables for token, client, rtmClient, channel, and other parameters.
let token = null; // The authentication token.
let client; // Agora RTC client for audio/video communication.
let rtmClient; // Agora RTM (Real-Time Messaging) client for chat and messaging.
let channel; // Agora RTM channel for chat and messaging.
let roomId; // The ID of the room, obtained from the URL query parameters.
const queryString = window.location.search; // Retrieve query string from the URL.
const urlParams = new URLSearchParams(queryString); // Parse the query string.
roomId = urlParams.get('room'); // Get the 'room' parameter from the URL, default to 'main' if not present.


// Check if 'roomId' is not defined (falsy), and if so, assign the default value 'main'.
if (!roomId) {
    roomId = 'main'; // Default room ID in case it's not provided.
}

// Retrieve the user's display name from session storage.
let displayName = sessionStorage.getItem('display_name');

// If the display name is not available in session storage, redirect to the lobby page.
if (!displayName) {
    window.location = 'lobby.html'; // Redirect to the lobby page if the display name is not set.
}

// Initialize arrays and variables for local and remote tracks, and screen sharing.
let localTracks = []; // Array to store the local audio and video tracks.
let remoteUsers = {}; // Object to track remote users and their tracks.
let localScreenTracks; // Local screen sharing tracks.
let sharingScreen = false; // Flag to indicate if screen sharing is active.


// Initialize the 'joinRoomInit' function for joining the room.
let joinRoomInit = async () => {
    // Initialize an Agora RTM client and create an instance.
    rtmClient = await AgoraRTM.createInstance(APP_ID);

    // Log in to the RTM client with a user ID and token for authentication.
    await rtmClient.login({ uid, token });

    // Add or update local user attributes, such as the display name.
    await rtmClient.addOrUpdateLocalUserAttributes({ 'name': displayName });

    // Create an RTM channel with the specified room ID and join it.
    channel = await rtmClient.createChannel(roomId);
    await channel.join();

    // Set up event handlers for member joining, leaving, and channel messages.
    channel.on('MemberJoined', handleMemberJoined);
    channel.on('MemberLeft', handleMemberLeft);
    channel.on('ChannelMessage', handleChannelMessage);

    // Get the list of channel members and display a welcome message.
    getMembers();
    addBotMessageToDom(`Welcome to the room ${displayName}! 👋`);

    // Initialize an Agora RTC client for real-time audio/video communication.
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    // Join the Agora RTC channel with the specified room ID, token, and user ID.
    await client.join(APP_ID, roomId, token, uid);

    // Set up event handlers for user publishing and leaving in the RTC client.
    client.on('user-published', handleUserPublished);
    client.on('user-left', handleUserLeft);
}

// Initialize the 'joinStream' function for joining a video stream.
let joinStream = async () => {
    // Hide the 'Join' button and display the video stream controls.
    document.getElementById('join-btn').style.display = 'none';
    document.getElementsByClassName('stream__actions')[0].style.display = 'flex';

    // Create local audio and video tracks with specific encoder configuration.
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
        {},
        {
            encoderConfig: {
                width: { min: 640, ideal: 1920, max: 1920 },
                height: { min: 480, ideal: 1080, max: 1080 },
            },
        }
    );

    // Create a video player element for the local stream and add it to the DOM.
    let player = `<div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                 </div>`;

    document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);

    // Add a click event listener to the video container for expanding the video frame.
    document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame);

    // Play the local video track on the created player element and publish it to the channel.
    localTracks[1].play(`user-${uid}`);
    await client.publish([localTracks[0], localTracks[1]]);
}


let switchToCamera = async () => {
    let player = `<div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                 </div>`
    displayFrame.insertAdjacentHTML('beforeend', player)

    await localTracks[0].setMuted(true)
    await localTracks[1].setMuted(true)

    document.getElementById('mic-btn').classList.remove('active')
    document.getElementById('screen-btn').classList.remove('active')

    localTracks[1].play(`user-${uid}`)
    await client.publish([localTracks[1]])
}

// Define the 'handleUserPublished' function to handle newly published user streams.
let handleUserPublished = async (user, mediaType) => {
    // Store information about the remote user using their UID as the key.
    remoteUsers[user.uid] = user;

    // Subscribe to the user's stream of the specified media type (audio or video).
    await client.subscribe(user, mediaType);

    // Check if a player element for this user already exists in the DOM.
    let player = document.getElementById(`user-container-${user.uid}`);
    if (player === null) {
        // If not, create a video container element and add it to the DOM.
        player = `<div class="video__container" id="user-container-${user.uid}">
                <div class="video-player" id="user-${user.uid}"></div>
            </div>`;

        document.getElementById('streams__container').insertAdjacentHTML('beforeend', player);

        // Add a click event listener to the video container for expanding the video frame.
        document.getElementById(`user-container-${user.uid}`).addEventListener('click', expandVideoFrame);
    }

    // If the display frame is visible, adjust the size of the video frame.
    if (displayFrame.style.display) {
        let videoFrame = document.getElementById(`user-container-${user.uid}`);
        videoFrame.style.height = '100px';
        videoFrame.style.width = '100px';
    }

    // Play the user's video or audio track, depending on the media type.
    if (mediaType === 'video') {
        user.videoTrack.play(`user-${user.uid}`);
    }

    if (mediaType === 'audio') {
        user.audioTrack.play();
    }
}


let handleUserLeft = async (user) => {
    delete remoteUsers[user.uid]
    let item = document.getElementById(`user-container-${user.uid}`)
    if(item){
        item.remove()
    }

    if(userIdInDisplayFrame === `user-container-${user.uid}`){
        displayFrame.style.display = null
        
        let videoFrames = document.getElementsByClassName('video__container')

        for(let i = 0; videoFrames.length > i; i++){
            videoFrames[i].style.height = '300px'
            videoFrames[i].style.width = '300px'
        }
    }
}

let toggleMic = async (e) => {
    let button = e.currentTarget

    if(localTracks[0].muted){
        await localTracks[0].setMuted(false)
        button.classList.add('active')
    }else{
        await localTracks[0].setMuted(true)
        button.classList.remove('active')
    }
}

let toggleCamera = async (e) => {
    let button = e.currentTarget

    if(localTracks[1].muted){
        await localTracks[1].setMuted(false)
        button.classList.add('active')
    }else{
        await localTracks[1].setMuted(true)
        button.classList.remove('active')
    }
}

let toggleScreen = async (e) => {
    let screenButton = e.currentTarget
    let cameraButton = document.getElementById('camera-btn')

    if(!sharingScreen){
        sharingScreen = true

        screenButton.classList.add('active')
        cameraButton.classList.remove('active')
        cameraButton.style.display = 'none'

        localScreenTracks = await AgoraRTC.createScreenVideoTrack()

        document.getElementById(`user-container-${uid}`).remove()
        displayFrame.style.display = 'block'

        let player = `<div class="video__container" id="user-container-${uid}">
                <div class="video-player" id="user-${uid}"></div>
            </div>`

        displayFrame.insertAdjacentHTML('beforeend', player)
        document.getElementById(`user-container-${uid}`).addEventListener('click', expandVideoFrame)

        userIdInDisplayFrame = `user-container-${uid}`
        localScreenTracks.play(`user-${uid}`)

        await client.unpublish([localTracks[1]])
        await client.publish([localScreenTracks])

        let videoFrames = document.getElementsByClassName('video__container')
        for(let i = 0; videoFrames.length > i; i++){
            if(videoFrames[i].id != userIdInDisplayFrame){
              videoFrames[i].style.height = '100px'
              videoFrames[i].style.width = '100px'
            }
          }


    }else{
        sharingScreen = false 
        cameraButton.style.display = 'block'
        document.getElementById(`user-container-${uid}`).remove()
        await client.unpublish([localScreenTracks])

        switchToCamera()
    }
}

let leaveStream = async (e) => {
    e.preventDefault()

    document.getElementById('join-btn').style.display = 'block'
    document.getElementsByClassName('stream__actions')[0].style.display = 'none'

    for(let i = 0; localTracks.length > i; i++){
        localTracks[i].stop()
        localTracks[i].close()
    }

    await client.unpublish([localTracks[0], localTracks[1]])

    if(localScreenTracks){
        await client.unpublish([localScreenTracks])
    }

    document.getElementById(`user-container-${uid}`).remove()

    if(userIdInDisplayFrame === `user-container-${uid}`){
        displayFrame.style.display = null

        for(let i = 0; videoFrames.length > i; i++){
            videoFrames[i].style.height = '300px'
            videoFrames[i].style.width = '300px'
        }
    }

    channel.sendMessage({text:JSON.stringify({'type':'user_left', 'uid':uid})})
}



document.getElementById('camera-btn').addEventListener('click', toggleCamera)
document.getElementById('mic-btn').addEventListener('click', toggleMic)
document.getElementById('screen-btn').addEventListener('click', toggleScreen)
document.getElementById('join-btn').addEventListener('click', joinStream)
document.getElementById('leave-btn').addEventListener('click', leaveStream)


joinRoomInit()