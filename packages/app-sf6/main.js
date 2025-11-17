// MOVED and HEAVILY MODIFIED
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3');
const { DatabaseService } = require('@game-trackers/core'); // <-- 1. Import from core

// --- App-Specific Setup ---
const DB_PATH = path.join(__dirname, 'sf6_data.sqlite'); // Use __dirname to get current directory
const db = new sqlite3.Database(DB_PATH); // 2. Create the app-specific DB connection
const dbService = new DatabaseService(db); // 3. Inject it into the core service

// App-specific initial data
const SAMPLE_PLAYERS = ["Player 1", "Player 2"];
const SAMPLE_CHARACTERS = ["Ryu", "Chun-Li", "Ken", "Guile"];
// ---

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(async () => {
    try {
        // 4. Initialize the DB with app-specific data
        await dbService.initDb(SAMPLE_PLAYERS, SAMPLE_CHARACTERS);
        console.log(`Database initialized at ${DB_PATH}`);
        createWindow();
    } catch (err) {
        console.error("Failed to initialize database:", err);
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers (Now just simple pass-throughs) ---
// 5. All logic is now inside dbService. The IPC handler just calls it.
ipcMain.handle('db:get-players', () => dbService.getPlayers());
ipcMain.handle('db:get-characters', () => dbService.getCharacters());
ipcMain.handle('db:get-all-pc-elos', () => dbService.getAllPlayerCharacterElosWithNames());
ipcMain.handle('db:get-match-history', () => dbService.getMatchHistoryWithNames());

ipcMain.handle('db:submit-match', async (event, matchData) => {
    try {
        return await dbService.submitMatchTransaction(matchData);
    } catch (error) {
        console.error('Error submitting match:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
});

ipcMain.handle('db:delete-match', async (event, matchId) => {
    try {
        return await dbService.deleteMatchTransaction(matchId);
    } catch (error) {
        console.error('Error deleting match:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
});