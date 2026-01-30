// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Constants
const MAX_SLIDES = 20;
const SECONDS_PER_SLIDE = 20;

// State
let pdfDocument = null;
let renderedPages = [];
let totalSlides = 0;
let currentSlide = 0;
let slideTimer = null;
let progressTimer = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const dragOverlay = document.getElementById('drag-overlay');
const fileInput = document.getElementById('file-input');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const readyArea = document.getElementById('ready-area');
const readyMessage = document.getElementById('ready-message');
const startBtn = document.getElementById('start-btn');
const uploadScreen = document.getElementById('upload-screen');
const presentationScreen = document.getElementById('presentation-screen');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const slideContainer = document.getElementById('slide-container');
const slideCanvas = document.getElementById('slide-canvas');
const progressBarContainer = document.getElementById('progress-bar-container');
const slideProgress = document.getElementById('slide-progress');
const endScreen = document.getElementById('end-screen');

// Event Listeners
fileInput.addEventListener('change', handleFileSelect);
startBtn.addEventListener('click', startPresentation);

// Full-page drag and drop
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('d-none');
});

document.addEventListener('dragleave', (e) => {
    // Only hide if leaving the document entirely
    if (e.relatedTarget === null) {
        dragOverlay.classList.add('d-none');
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.add('d-none');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// Handle file selection from input
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// Format duration as "X minutes Y seconds" or just "Y seconds"
function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes === 0) {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (seconds === 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
}

// Process the uploaded file
async function handleFile(file) {
    // Reset state
    resetState();
    
    // Validate file type
    if (file.type !== 'application/pdf') {
        showError('Please upload a PDF file.');
        return;
    }
    
    // Show loading
    loading.classList.remove('d-none');
    
    try {
        // Load PDF
        const arrayBuffer = await file.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // Validate page count (1 to MAX_SLIDES)
        if (pdfDocument.numPages < 1) {
            showError('Your PDF file appears to be empty.');
            return;
        }
        
        if (pdfDocument.numPages > MAX_SLIDES) {
            showError(`Your PDF file has ${pdfDocument.numPages} pages. The maximum allowed is ${MAX_SLIDES} pages.`);
            return;
        }
        
        totalSlides = pdfDocument.numPages;
        
        // Pre-render all pages for smooth playback
        await preRenderPages();
        
        // Show ready state
        loading.classList.add('d-none');
        
        const slideWord = totalSlides === 1 ? 'slide' : 'slides';
        const totalSeconds = totalSlides * SECONDS_PER_SLIDE;
        const duration = formatDuration(totalSeconds);
        readyMessage.textContent = `Ready to present ${totalSlides} ${slideWord} in ${duration}?`;
        readyArea.classList.remove('d-none');
        
    } catch (err) {
        console.error('Error loading PDF file:', err);
        showError('Could not load the file. Please make sure it is a valid PDF file.');
    }
}

// Pre-render all pages to image data
async function preRenderPages() {
    renderedPages = [];
    
    for (let i = 1; i <= totalSlides; i++) {
        const page = await pdfDocument.getPage(i);
        
        // Calculate scale to fit screen nicely
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(
            (window.innerWidth * 0.95) / viewport.width,
            (window.innerHeight * 0.9) / viewport.height
        );
        const scaledViewport = page.getViewport({ scale });
        
        // Create offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        }).promise;
        
        renderedPages.push({
            dataUrl: canvas.toDataURL(),
            width: canvas.width,
            height: canvas.height
        });
    }
}

// Show error message
function showError(message) {
    loading.classList.add('d-none');
    readyArea.classList.add('d-none');
    errorMessage.textContent = message;
    errorMessage.classList.remove('d-none');
}

// Reset state for new upload
function resetState() {
    pdfDocument = null;
    renderedPages = [];
    totalSlides = 0;
    currentSlide = 0;
    
    if (slideTimer) clearInterval(slideTimer);
    if (progressTimer) clearInterval(progressTimer);
    
    loading.classList.add('d-none');
    errorMessage.classList.add('d-none');
    readyArea.classList.add('d-none');
}

// Start the presentation
async function startPresentation() {
    // Switch to presentation screen
    uploadScreen.classList.add('d-none');
    presentationScreen.classList.remove('d-none');
    
    // Request fullscreen
    try {
        await document.documentElement.requestFullscreen();
    } catch (err) {
        console.warn('Fullscreen request failed:', err);
        // Continue anyway – presentation will still work
    }
    
    // Start countdown
    await runCountdown();
    
    // Start slideshow
    runSlideshow();
}

// Run 3-2-1 countdown
function runCountdown() {
    return new Promise((resolve) => {
        countdownOverlay.classList.remove('d-none');
        let count = 3;
        
        countdownNumber.textContent = count;
        
        const countdownInterval = setInterval(() => {
            count--;
            
            if (count > 0) {
                countdownNumber.textContent = count;
                // Re-trigger animation
                countdownNumber.style.animation = 'none';
                countdownNumber.offsetHeight; // Force reflow
                countdownNumber.style.animation = 'pulse 1s ease-in-out';
            } else {
                clearInterval(countdownInterval);
                countdownOverlay.classList.add('d-none');
                resolve();
            }
        }, 1000);
    });
}

// Run the slideshow
function runSlideshow() {
    currentSlide = 0;
    
    // Show slide container and progress bar
    slideContainer.classList.remove('d-none');
    progressBarContainer.classList.remove('d-none');
    
    // Display first slide
    displaySlide(currentSlide);
    startSlideTimer();
    
    // Set up slide advancement
    slideTimer = setInterval(() => {
        currentSlide++;
        
        if (currentSlide >= totalSlides) {
            // End of presentation
            clearInterval(slideTimer);
            clearInterval(progressTimer);
            showEndScreen();
        } else {
            displaySlide(currentSlide);
            startSlideTimer();
        }
    }, SECONDS_PER_SLIDE * 1000);
}

// Display a specific slide
function displaySlide(index) {
    const page = renderedPages[index];
    
    slideCanvas.width = page.width;
    slideCanvas.height = page.height;
    
    const ctx = slideCanvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
    };
    img.src = page.dataUrl;
}

// Start/reset the progress bar timer for current slide
function startSlideTimer() {
    // Reset progress
    slideProgress.style.width = '0%';
    
    if (progressTimer) clearInterval(progressTimer);
    
    const startTime = Date.now();
    const duration = SECONDS_PER_SLIDE * 1000;
    
    progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / duration) * 100, 100);
        slideProgress.style.width = `${progress}%`;
    }, 50);
}

// Show blank end screen
function showEndScreen() {
    slideContainer.classList.add('d-none');
    progressBarContainer.classList.add('d-none');
    endScreen.classList.remove('d-none');
}

// Handle exiting fullscreen (allow user to return to upload screen)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && presentationScreen.classList.contains('d-none') === false) {
        // User exited fullscreen – return to upload screen
        presentationScreen.classList.add('d-none');
        uploadScreen.classList.remove('d-none');
        
        // Clean up timers
        if (slideTimer) clearInterval(slideTimer);
        if (progressTimer) clearInterval(progressTimer);
        
        // Hide presentation elements
        countdownOverlay.classList.add('d-none');
        slideContainer.classList.add('d-none');
        progressBarContainer.classList.add('d-none');
        endScreen.classList.add('d-none');
    }
});
