document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const shutterBtn = document.getElementById('shutter-btn');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const logoInput = document.getElementById('logo-upload');
    const overlayContent = document.getElementById('overlay-content');
    const textPlaceholder = document.getElementById('text-placeholder');
    const sizeSlider = document.getElementById('size-slider');

    // Modal Elements
    const modal = document.getElementById('preview-modal');
    const capturedImage = document.getElementById('captured-image');
    const retakeBtn = document.getElementById('retake-btn');
    const downloadBtn = document.getElementById('download-btn');

    // State
    let stream = null;
    let facingMode = 'environment';
    let currentLogoImg = null;
    let currentLogoUrl = null; // Track URL for memory cleanup
    let db = null;

    // Transform State
    let currentX = 0;
    let currentY = 0;
    let currentScale = 1;
    let xOffset = 0;
    let yOffset = 0;

    // --- 0. IndexedDB Persistence ---
    const DB_NAME = 'SignPhotoDB';
    const DB_VERSION = 1;
    const STORE_SETTINGS = 'settings';

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
                loadSavedData();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
                }
            };
        });
    }

    function saveImageToDB(file) {
        if (!db) return;
        const transaction = db.transaction([STORE_SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORE_SETTINGS);
        store.put({ id: 'overlayImage', blob: file });
    }

    // Debounce saving settings to avoid spamming DB on every drag/resize
    let saveTimeout;
    function saveSettingsToDB() {
        if (!db) return;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const transaction = db.transaction([STORE_SETTINGS], 'readwrite');
            const store = transaction.objectStore(STORE_SETTINGS);
            store.put({
                id: 'overlaySettings',
                x: xOffset,
                y: yOffset,
                scale: currentScale
            });
        }, 500);
    }

    function loadSavedData() {
        if (!db) return;

        const transaction = db.transaction([STORE_SETTINGS], 'readonly');
        const store = transaction.objectStore(STORE_SETTINGS);

        // Load Settings
        const settingsReq = store.get('overlaySettings');
        settingsReq.onsuccess = (e) => {
            const data = e.target.result;
            if (data) {
                currentX = data.x || 0;
                currentY = data.y || 0;
                xOffset = data.x || 0;
                yOffset = data.y || 0;
                currentScale = data.scale || 1;

                // Update UI immediately (if element exists)
                updateTransform();
                if (sizeSlider) sizeSlider.value = currentScale;
            }
        };

        // Load Image
        const imageReq = store.get('overlayImage');
        imageReq.onsuccess = (e) => {
            const result = e.target.result;
            if (result && result.blob) {
                displayOverlayImage(result.blob);
            }
        };
    }

    function displayOverlayImage(blob) {
        // Memory cleanup
        if (currentLogoUrl) {
            URL.revokeObjectURL(currentLogoUrl);
        }

        if (textPlaceholder) textPlaceholder.style.display = 'none';
        overlayContent.innerHTML = '';

        const img = document.createElement('img');
        currentLogoUrl = URL.createObjectURL(blob);
        img.src = currentLogoUrl;
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
    initDB();
    startCamera();

    toggleCameraBtn.addEventListener('click', () => {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        startCamera();
    });

    // --- 2. Overlay Handling ---
    logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            displayOverlayImage(file);
            saveImageToDB(file);
        }
    });

    // Slider Handling
    sizeSlider.addEventListener('input', (e) => {
        currentScale = parseFloat(e.target.value);
        updateTransform();
        saveSettingsToDB();
    });

    // --- Drag Logic ---
    let isDragging = false;
    let initialX;
    let initialY;

    // Use container logic but apply to overlayContent
    const dragItem = document.getElementById("overlay-content");
    const container = document.querySelector(".overlay-layer");

    container.addEventListener("touchstart", dragStart, { passive: false });
    container.addEventListener("touchend", dragEnd, { passive: false });
    container.addEventListener("touchmove", drag, { passive: false });

    container.addEventListener("mousedown", dragStart);
    container.addEventListener("mouseup", dragEnd);
    container.addEventListener("mousemove", drag);

    function dragStart(e) {
        // Allow dragging if touching the item or its children
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
        if (isDragging) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            saveSettingsToDB(); // Save position on drop
        }
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

            updateTransform();
        }
    }

    function updateTransform() {
        // Apply both translate and scale
        dragItem.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0) scale(${currentScale})`;
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

        // Calculate Scale & Offset
        const videoRect = video.getBoundingClientRect();
        const renderRatio = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
        const renderWidth = video.videoWidth * renderRatio;
        // The container/viewport offsets:
        const offsetX = (videoRect.width - renderWidth) / 2;

        // Element Position (Get bounding rect includes transforms like scale!)
        // However, we want the "visual" rect to map to pixels.
        const overlayRect = dragItem.getBoundingClientRect();

        // Canvas Mapping
        // Relative X from the "start" of the video content
        const relativeX = overlayRect.left - (videoRect.left + offsetX);
        const relativeY = overlayRect.top - (videoRect.top + ((videoRect.height - (video.videoHeight * renderRatio)) / 2));

        // Scale back to source resolution
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
