const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./src/db/database'); // Adjusted path

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false, // Ensure this is false for security
        },
    });

    mainWindow.loadFile('src/index.html'); // Adjusted path
    // mainWindow.webContents.openDevTools(); // Uncomment to open DevTools
}

app.whenReady().then(() => {
    db.initDb((err) => {
        if (err) {
            console.error("Failed to initialize database:", err);
            app.quit();
        } else {
            console.log("Database initialized successfully.");
            createWindow();
        }
    });

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

// IPC Handlers for database operations
ipcMain.handle('db:get-players', async () => await db.getPlayers());
ipcMain.handle('db:get-characters', async () => await db.getCharacters());
ipcMain.handle('db:get-all-pc-elos', async () => await db.getAllPlayerCharacterElosWithNames());
ipcMain.handle('db:get-match-history', async () => await db.getMatchHistoryWithNames());

ipcMain.handle('db:submit-match', async (event, matchData) => {
    const { player1Name, player1CharName, player2Name, player2CharName, winnerName } = matchData;

    try {
        // 1 & 2. Get or create players and characters
        const p1 = await db.getOrCreatePlayer(player1Name);
        const c1 = await db.getOrCreateCharacter(player1CharName);
        const p2 = await db.getOrCreatePlayer(player2Name);
        const c2 = await db.getOrCreateCharacter(player2CharName);

        // 3. Get or create player-character Elo entries
        let p1EloData = await db.getOrCreatePlayerCharacterElo(p1.player_id, c1.character_id);
        let p2EloData = await db.getOrCreatePlayerCharacterElo(p2.player_id, c2.character_id);

        // 4. Determine scores
        const score1 = (winnerName === player1Name) ? 1 : 0;
        const score2 = (winnerName === player2Name) ? 1 : 0; // or 1 - score1

        // 5. Calculate new Elos
        const eloSystem = require('./src/elo/elo'); // Adjusted path
        const { newEloA: newP1Elo, newEloB: newP2Elo } = eloSystem.calculateNewElos(p1EloData.elo, p2EloData.elo, score1);

        // 6. Update Elos in DB
        await db.updatePlayerCharacterElo(p1EloData.pc_elo_id, newP1Elo);
        await db.updatePlayerCharacterElo(p2EloData.pc_elo_id, newP2Elo);

        // 7. Log the match
        const winnerPlayerId = (winnerName === player1Name) ? p1.player_id : p2.player_id;
        await db.logMatch(p1.player_id, c1.character_id, p2.player_id, c2.character_id, winnerPlayerId);

        return { success: true, message: 'Match logged and Elos updated!' };
    } catch (error) {
        console.error('Error submitting match:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
});