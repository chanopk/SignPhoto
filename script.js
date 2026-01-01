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

            // Mirror logic handled in CSS and Canvas Draw
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

    startCamera();

    toggleCameraBtn.addEventListener('click', () => {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        startCamera();
    });

    // --- 2. Overlay Handling (Logo Upload) ---
    logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (textPlaceholder) textPlaceholder.style.display = 'none';
                overlayContent.innerHTML = '';

                const img = document.createElement('img');
                img.src = event.target.result;
                img.style.pointerEvents = 'none'; // Ensure drag events bubble to container logic if needed
                overlayContent.appendChild(img);

                currentLogoImg = img;
            };
            reader.readAsDataURL(file);
        }
    });

    // --- Drag Logic ---
    // Using touch/mouse events to move the #overlay-content div
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

    // --- 3. Capture Logic with Correct Mapping ---
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

        // Calculate Scale & Offset for Overlay
        // The video element uses object-fit: cover.
        // We need to match precise visual coordinates to the full-res canvas.
        const videoRect = video.getBoundingClientRect();

        // Rendered dimensions of the video content within the element
        const renderRatio = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
        const renderWidth = video.videoWidth * renderRatio;
        const renderHeight = video.videoHeight * renderRatio;

        // Offsets (centering)
        const offsetX = (videoRect.width - renderWidth) / 2;
        const offsetY = (videoRect.height - renderHeight) / 2;

        // Overlay Position relative to the Viewport (same as videoRect starts)
        const overlayRect = dragItem.getBoundingClientRect();

        // Calculate position relative to the *rendered video content*
        // overlayRect.left is screen config. videoRect.left is screen config.
        // The rendered video starts at videoRect.left + offsetX
        const relativeX = overlayRect.left - (videoRect.left + offsetX);
        const relativeY = overlayRect.top - (videoRect.top + offsetY);

        // Scale back to source resolution
        const sourceX = relativeX / renderRatio;
        const sourceY = relativeY / renderRatio;
        const sourceW = overlayRect.width / renderRatio;
        const sourceH = overlayRect.height / renderRatio;

        // Mapping for user facing camera mirror on overlay
        // If mirroring, the x coordinate needs flip relative to the center or just standard flip?
        // Standard flip: x' = width - x - w
        if (facingMode === 'user') {
            // For overlay, if we see it on left, it is on left.
            // But valid canvas is mirrored. 
            // If I physically move logo to left (screen left), and I capture:
            // The video is mirrored. My left face is on the right of image.
            // The logo is on the left of screen.
            // Should the logo stay on the left? or follow the reflection?
            // Usually overlays are post-fx, so they should stick to visual "screen" coordinates.
            // If I see logo on left cheek, it should be on left cheek in output.
            // Left cheek in mirrored view is Left Screen.
            // Left cheek in unmirrored (true) view is Right Side of image.

            // The ctx.drawImage(video) above handled un-mirroring (or rather re-mirroring to act like a mirror? No).
            // Standard camera app: Selfie preview is mirrored. Saved file is usually NOT mirrored (marketing standard), OR mirrored (user preference).
            // Let's stick to "What You See Is What You Get" relative to the frame.

            // If I mirror the video draw:
            // ctx.scale(-1, 1); ctx.drawImage(...)
            // This produces a mirrored image (text is backward).
            // If user wants readable text logo, they shouldn't mirror capture?
            // BUT, if the logo is added *after* mirror?

            // Current logic:
            // 1. Draw video mirrored (as user sees it).
            // 2. Draw text/logo.
            // This gives a final image that is a mirror of reality. (Text in video is backwards, Logo is forwards).

            // If we just use the calculated 'sourceX' which is from Left to Right on screen.
            // And we draw on a mirrored canvas?

            // Let's simplify: We want to draw exactly what is on the element onto the canvas.
            // If we mirrored the video draw context, the coordinate system is flipped?
            // No, I used ctx.save() / ctx.restore() for the video draw.
            // So context is back to normal (0,0 is top-left).

            // But the video image on canvas is now FLIPPED relative to source?
            // Yes, I did `ctx.translate(w,0); ctx.scale(-1,1)`.
            // So the pixel at x=0 in source is at x=W in canvas.

            // Visual Alignment:
            // User sees Video pixel A at Screen Left.
            // User places Logo at Screen Left.
            // In Canvas:
            // Video pixel A effectively drawn at Canvas Left (because we mirrored the draw to match preview).
            // So we should draw Logo at Canvas Left.
            // So 'sourceX' (calculated from screen left) is correct.

            // Wait, `video.style.transform = scaleX(-1)` mirrors the VISUAL element.
            // So the user sees a mirrored version.
            // Video Source (Raw) -> Mirrored CSS -> User's Eyes.
            // Canvas Draw:
            // Video Source (Raw) -> ctx.scale(-1, 1) -> Canvas.
            // So Canvas matches User's Eyes.
            // Logic holds.
        }

        if (currentLogoImg) {
            ctx.drawImage(currentLogoImg, sourceX, sourceY, sourceW, sourceH);
        } else {
            // Draw placeholder text if wanted?
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
