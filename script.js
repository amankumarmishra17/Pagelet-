// Configuration
const CALENDAR_ID = '387df572cefa9fb4fba9087418f2c64a0bff6a1c0bc43cc152135482d2f70567@group.calendar.google.com';
const API_KEY = 'AIzaSyBVvPfOOJEVR4P-F31LINGe2uN0AzucZh0';
const CLIENT_ID = '259372804218-j4fa19g55vf84svurdqtmu3ms5vikeqo.apps.googleusercontent.com';

// Discovery doc URL for APIs used by the app
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

// Global variables
let calendarEvents = [];
let isLoading = false;
let tokenClient;
let gapiInited = false;
let gisInited = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadGoogleAPIs();
});

function initializeApp() {
    updateCurrentDate();
    initializeTheme();
    setupEventListeners();
    renderTimeline();
}

// Load Google APIs
function loadGoogleAPIs() {
    // Load gapi
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = gapiLoaded;
    gapiScript.onerror = () => {
        console.error('Failed to load gapi script');
        renderTimeline();
    };
    document.head.appendChild(gapiScript);

    // Load gis
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = gisLoaded;
    gisScript.onerror = () => {
        console.error('Failed to load gis script');
        renderTimeline();
    };
    document.head.appendChild(gisScript);
}

// Callback after api.js is loaded
function gapiLoaded() {
    console.log('GAPI loaded');
    gapi.load('client', initializeGapiClient);
}

// Callback after the API client is loaded
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        console.log('GAPI initialized successfully');
        maybeEnableAuth();
    } catch (error) {
        console.error('Error initializing GAPI:', error);
        renderTimeline();
    }
}

// Callback after Google Identity Services are loaded
function gisLoaded() {
    console.log('GIS loaded');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableAuth();
}

// Enable auth after all libraries are loaded
function maybeEnableAuth() {
    if (gapiInited && gisInited) {
        console.log('Both APIs loaded, attempting to fetch events');
        // Try to load events automatically
        handleAuthClick();
    }
}

function updateCurrentDate() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (theme === 'dark') {
        themeIcon.className = 'fas fa-sun';
        themeText.textContent = 'Light';
    } else {
        themeIcon.className = 'fas fa-moon';
        themeText.textContent = 'Dark';
    }
}

function setupEventListeners() {
    // Timeline view buttons
    const timelineBtns = document.querySelectorAll('.timeline-btn');
    timelineBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            timelineBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const view = this.getAttribute('data-view');
            updateTimelineView(view);
        });
    });

    // Modal close on outside click
    document.getElementById('lectureModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeLectureModal();
        }
    });
}

// Handle authentication
function handleAuthClick() {
    if (!gapiInited || !gisInited) {
        console.log('APIs not ready yet');
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Auth error:', resp);
            renderTimeline();
            return;
        }
        console.log('Authentication successful');
        await fetchCalendarEvents();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // Skip display of account chooser and consent dialog for existing session
        tokenClient.requestAccessToken({prompt: ''});
    }
}

async function handleRefresh() {
    if (isLoading) return;
    
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) {
        refreshIcon.classList.add('fa-spin');
    }
    
    if (gapi.client.getToken() === null) {
        // Need to authenticate first
        handleAuthClick();
    } else {
        // Already authenticated, just fetch events
        await fetchCalendarEvents();
    }
    
    if (refreshIcon) {
        refreshIcon.classList.remove('fa-spin');
    }
}

async function fetchCalendarEvents() {
    if (isLoading || !gapiInited) return;
    
    isLoading = true;
    showLoadingState();

    try {
        console.log('Fetching calendar events...');
        
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date();
        endOfDay.setDate(now.getDate() + 7); // Next 7 days

        console.log('Date range:', startOfDay.toISOString(), 'to', endOfDay.toISOString());

        const response = await gapi.client.calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 20
        });

        console.log('API Response:', response);
        
        const events = response.result.items || [];
        console.log('Number of events found:', events.length);
        
        calendarEvents = events.map(event => ({
            id: event.id,
            title: event.summary || 'Untitled Event',
            description: event.description || 'No description available',
            location: event.location || 'Location not specified',
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            organizer: event.creator?.displayName || event.organizer?.displayName || 'Unknown',
            htmlLink: event.htmlLink,
            attachments: event.attachments || [],
            hangoutLink: event.hangoutLink,
            conferenceData: event.conferenceData
        }));

        console.log('Processed events:', calendarEvents);
        renderTimeline();
        
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        calendarEvents = [];
        renderTimeline();
    } finally {
        isLoading = false;
        hideLoadingState();
    }
}

function showLoadingState() {
    const timeline = document.getElementById('timeline');
    if (timeline) {
        timeline.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading your schedule...</p>
            </div>
        `;
    }
}

function hideLoadingState() {
    // Loading state will be replaced by renderTimeline()
}

function renderTimeline() {
    const timeline = document.getElementById('timeline');
    if (!timeline) return;

    timeline.innerHTML = '';

    if (calendarEvents.length === 0) {
        const isAuthenticated = gapiInited && gapi.client.getToken() !== null;
        
        timeline.innerHTML = `
            <div class="no-events">
                <div class="break-animation">
                    <i class="fas fa-mug-hot"></i>
                </div>
                <h3>Enjoy the Break! ☕</h3>
                <p>${isAuthenticated ? 'No lectures scheduled for the next 7 days' : 'Connect to Google Calendar to see your events'}</p>
                <div class="break-suggestions">
                    <div class="suggestion-item">
                        <i class="fas fa-book"></i>
                        <span>Review your notes</span>
                    </div>
                    <div class="suggestion-item">
                        <i class="fas fa-dumbbell"></i>
                        <span>Hit the gym</span>
                    </div>
                    <div class="suggestion-item">
                        <i class="fas fa-users"></i>
                        <span>Catch up with friends</span>
                    </div>
                </div>
                <button class="btn-refresh" onclick="handleRefresh()">
                    <i class="fas fa-sync-alt"></i>
                    ${isAuthenticated ? 'Check Again' : 'Connect Google Calendar'}
                </button>
            </div>
        `;
        return;
    }

    calendarEvents.forEach(event => {
        const timelineItem = createTimelineItem(event);
        timeline.appendChild(timelineItem);
    });
}

function createTimelineItem(event) {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    const timeString = formatTime(startTime);
    const duration = calculateDuration(startTime, endTime);
    const eventClass = getEventClass(event.title);

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    timelineItem.onclick = () => showLectureDetails(event);

    const attachmentIndicator = event.attachments && event.attachments.length > 0 
        ? '<div class="attachment-indicator"><i class="fas fa-paperclip"></i></div>' 
        : '';

    timelineItem.innerHTML = `
        <div class="timeline-time">${timeString}</div>
        <div class="timeline-content ${eventClass}">
            <div class="timeline-dot"></div>
            <div class="lecture-card">
                <div class="lecture-header">
                    <h3>${event.title}</h3>
                    ${attachmentIndicator}
                </div>
                <p>${event.location} • ${event.organizer}</p>
                <div class="lecture-duration">${duration}</div>
            </div>
        </div>
    `;

    return timelineItem;
}

function calculateDuration(start, end) {
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 60) {
        return `${diffMins} mins`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function getEventClass(title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('physics')) return 'physics';
    if (titleLower.includes('math')) return 'math';
    if (titleLower.includes('chemistry')) return 'chemistry';
    if (titleLower.includes('computer') || titleLower.includes('cs')) return 'cs';
    return 'physics';
}

function updateTimelineView(view) {
    if (view === 'week') {
        fetchCalendarEvents(); // Same function, already gets 7 days
    } else {
        fetchCalendarEvents();
    }
}

function showLectureDetails(event) {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    document.getElementById('modalTitle').textContent = event.title;
    document.getElementById('modalTime').textContent = `${formatTime(startTime)} - ${formatTime(endTime)}`;
    document.getElementById('modalLocation').textContent = event.location;
    document.getElementById('modalProfessor').textContent = event.organizer;
    document.getElementById('modalDescription').innerHTML = event.description.replace(/\n/g, '<br>');

    document.getElementById('lectureModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLectureModal() {
    document.getElementById('lectureModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}
