document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const shutterBtn = document.getElementById('shutter-btn');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const logoInput = document.getElementById('logo-upload');
    const overlayContent = document.getElementById('overlay-content');
    const textPlaceholder = document.getElementById('text-placeholder');

    // Modal Elements
    const modal = document.getElementById('preview-modal');
    const capturedImage = document.getElementById('captured-image');
    const retakeBtn = document.getElementById('retake-btn');
    const downloadBtn = document.getElementById('download-btn');

    // State
    let stream = null;
    let facingMode = 'environment';
    let currentLogoImg = null;
    let db = null;

    // --- 0. IndexedDB Persistence ---
    const DB_NAME = 'SignPhotoDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'settings';

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
                loadSavedImage(); // Load immediately after connection
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create an object store for settings if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    function saveImageToDB(file) {
        if (!db) return;

        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // simple key 'overlayImage'
        const request = store.put({ id: 'overlayImage', blob: file });

        request.onsuccess = () => {
            console.log("Image saved to DB");
        };

        request.onerror = (e) => {
            console.error("Error saving image", e);
        };
    }

    function loadSavedImage() {
        if (!db) return;

        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('overlayImage');

        request.onsuccess = (event) => {
            const result = event.target.result;
            if (result && result.blob) {
                displayOverlayImage(result.blob);
            }
        };
    }

    function displayOverlayImage(blob) {
        if (textPlaceholder) textPlaceholder.style.display = 'none';
        overlayContent.innerHTML = '';

        const img = document.createElement('img');
        // createObjectURL is efficient and works with Blobs/Files
        img.src = URL.createObjectURL(blob);
        img.style.pointerEvents = 'none';
        overlayContent.appendChild(img);

        currentLogoImg = img;
    }


    // --- 1. Camera Handling ---
    async function startCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        try {
            const constraints = {
                video: {
                    facingMode: lookingMode(),
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;

            updateMirrorStyling();

        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง");
        }
    }

    function lookingMode() {
        return facingMode;
    }

    function updateMirrorStyling() {
        if (facingMode === 'user') {
            video.style.transform = 'scaleX(-1)';
        } else {
            video.style.transform = 'scaleX(1)';
        }
    }

    // Initialize
    initDB(); // Start DB connection
    startCamera();

    toggleCameraBtn.addEventListener('click', () => {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        startCamera();
    });

    // --- 2. Overlay Handling (Logo Upload) ---
    logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Display immediately
            displayOverlayImage(file);
            // Save to DB
            saveImageToDB(file);
        }
    });

    // --- Drag Logic ---
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragItem = document.getElementById("overlay-content");
    const container = document.querySelector(".overlay-layer");

    container.addEventListener("touchstart", dragStart, { passive: false });
    container.addEventListener("touchend", dragEnd, { passive: false });
    container.addEventListener("touchmove", drag, { passive: false });

    container.addEventListener("mousedown", dragStart);
    container.addEventListener("mouseup", dragEnd);
    container.addEventListener("mousemove", drag);

    function dragStart(e) {
        if (e.target === dragItem || dragItem.contains(e.target)) {
            if (e.type === "touchstart") {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            isDragging = true;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, dragItem);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    // --- 3. Capture Logic ---
    shutterBtn.addEventListener('click', () => {
        if (!video.videoWidth) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');

        // Draw Video
        ctx.save();
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Overlay Calculation
        const videoRect = video.getBoundingClientRect();
        const renderRatio = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);

        // This math assumes the video fills the container with object-fit: cover
        // And the container IS the viewport or close to it.
        const renderWidth = video.videoWidth * renderRatio;
        // Offsets
        const offsetX = (videoRect.width - renderWidth) / 2;
        // In this specific app, videoRect usually equals viewport, but let's be safe.
        // Actually, if object-fit is cover, the visual image might be LARGER than element if not careful, 
        // OR the element clips the image.
        // If video element is 100vw/100vh and object-fit: cover, then renderWidth >= videoRect.width.
        // So offsetX is <= 0.

        // Element Position
        const overlayRect = dragItem.getBoundingClientRect();

        // Calculate relative to the ACTUAL video pixels rendered
        // The rendered video starts at: videoRect.left + offsetX
        // The overlay is at: overlayRect.left

        // Relative X from the "start" of the video image
        const relativeX = overlayRect.left - (videoRect.left + offsetX);
        const relativeY = overlayRect.top - (videoRect.top + ((videoRect.height - (video.videoHeight * renderRatio)) / 2));

        const sourceX = relativeX / renderRatio;
        const sourceY = relativeY / renderRatio;
        const sourceW = overlayRect.width / renderRatio;
        const sourceH = overlayRect.height / renderRatio;

        if (currentLogoImg) {
            ctx.drawImage(currentLogoImg, sourceX, sourceY, sourceW, sourceH);
        }

        // Show Result
        const dataURL = canvas.toDataURL('image/png');
        capturedImage.src = dataURL;
        modal.classList.remove('hidden');
    });

    // --- 4. Modal actions ---
    retakeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        capturedImage.src = "";
    });

    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `signphoto_${Date.now()}.png`;
        link.href = capturedImage.src;
        link.click();
    });
});
