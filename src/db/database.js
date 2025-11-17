const sqlite3 = require('sqlite3').verbose();
const DB_PATH = './smash_data.sqlite'; // Will be created in the project root

let db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { // Use function to access this.lastID
            if (err) {
                console.error('Error running SQL:', sql, params, err);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};

const getQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('Error running SQL GET:', sql, params, err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error running SQL ALL:', sql, params, err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};


const initDb = (callback) => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS players (
            player_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`, (err) => { if (err) return callback(err); });

        db.run(`CREATE TABLE IF NOT EXISTS characters (
            character_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`, (err) => { if (err) return callback(err); });

        db.run(`CREATE TABLE IF NOT EXISTS player_character_elos (
            pc_elo_id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            character_id INTEGER NOT NULL,
            elo INTEGER DEFAULT 1500,
            FOREIGN KEY (player_id) REFERENCES players(player_id),
            FOREIGN KEY (character_id) REFERENCES characters(character_id),
            UNIQUE (player_id, character_id)
        )`, (err) => { if (err) return callback(err); });

        db.run(`CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER NOT NULL,
            player1_character_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            player2_character_id INTEGER NOT NULL,
            winner_player_id INTEGER, -- Can be NULL if draw, or one of p1/p2 ID
            match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player1_id) REFERENCES players(player_id),
            FOREIGN KEY (player1_character_id) REFERENCES characters(character_id),
            FOREIGN KEY (player2_id) REFERENCES players(player_id),
            FOREIGN KEY (player2_character_id) REFERENCES characters(character_id)
        )`, (err) => { if (err) return callback(err); });

        // Initialize with some sample data if tables are empty
        db.get("SELECT COUNT(*) as count FROM players", async (err, row) => {
            if (err) return callback(err);
            if (row.count === 0) {
                console.log("Initializing sample players...");
                try {
                    await addPlayer("Player 1");
                    await addPlayer("Player 2");
                } catch (e) { return callback(e); }
            }
        });

        db.get("SELECT COUNT(*) as count FROM characters", async (err, row) => {
            if (err) return callback(err);
            if (row.count === 0) {
                console.log("Initializing sample characters...");
                try {
                    await addCharacter("Mario");
                    await addCharacter("Link");
                    await addCharacter("Pikachu");
                    await addCharacter("Samus");
                } catch(e) { return callback(e); }
            }
            callback(null); // Signal success
        });
    });
};

// Player Functions
const getPlayers = () => allQuery("SELECT * FROM players ORDER BY name");
const getPlayerByName = (name) => getQuery("SELECT * FROM players WHERE name = ?", [name]);
const addPlayer = async (name) => {
    const result = await runQuery("INSERT OR IGNORE INTO players (name) VALUES (?)", [name]);
    if (result.changes > 0) return { player_id: result.lastID, name };
    return getPlayerByName(name); // If IGNORE happened, fetch existing
};
const getOrCreatePlayer = async (name) => {
    let player = await getPlayerByName(name);
    if (!player) {
        const { lastID } = await runQuery("INSERT INTO players (name) VALUES (?)", [name]);
        player = { player_id: lastID, name: name };
    }
    return player;
};

// Character Functions
const getCharacters = () => allQuery("SELECT * FROM characters ORDER BY name");
const getCharacterByName = (name) => getQuery("SELECT * FROM characters WHERE name = ?", [name]);
const addCharacter = async (name) => {
    const result = await runQuery("INSERT OR IGNORE INTO characters (name) VALUES (?)", [name]);
    if (result.changes > 0) return { character_id: result.lastID, name };
    return getCharacterByName(name); // If IGNORE happened, fetch existing
};
const getOrCreateCharacter = async (name) => {
    let character = await getCharacterByName(name);
    if (!character) {
        const { lastID } = await runQuery("INSERT INTO characters (name) VALUES (?)", [name]);
        character = { character_id: lastID, name: name };
    }
    return character;
};


// Player-Character Elo Functions
const getPlayerCharacterElo = (playerId, characterId) => {
    return getQuery("SELECT * FROM player_character_elos WHERE player_id = ? AND character_id = ?", [playerId, characterId]);
};

const addPlayerCharacterElo = (playerId, characterId, elo = 1500) => {
    return runQuery("INSERT INTO player_character_elos (player_id, character_id, elo) VALUES (?, ?, ?)", [playerId, characterId, elo]);
};

const updatePlayerCharacterElo = (pcEloId, newElo) => {
    return runQuery("UPDATE player_character_elos SET elo = ? WHERE pc_elo_id = ?", [newElo, pcEloId]);
};

const getOrCreatePlayerCharacterElo = async (playerId, characterId, defaultElo = 1500) => {
    let pcElo = await getPlayerCharacterElo(playerId, characterId);
    if (!pcElo) {
        const { lastID } = await runQuery(
            "INSERT INTO player_character_elos (player_id, character_id, elo) VALUES (?, ?, ?)",
            [playerId, characterId, defaultElo]
        );
        pcElo = { pc_elo_id: lastID, player_id: playerId, character_id: characterId, elo: defaultElo };
    }
    return pcElo;
};

const getAllPlayerCharacterElosWithNames = () => {
    const sql = `
        SELECT p.name as playerName, c.name as characterName, pce.elo, pce.pc_elo_id,
        (
            SELECT COUNT(*)
            FROM matches m
            WHERE (pce.player_id = m.player1_id AND pce.character_id = m.player1_character_id)
            OR 
            (pce.player_id = m.player2_id AND pce.character_id = m.player2_character_id)
        ) as matchCount
        FROM player_character_elos pce
        JOIN players p ON p.player_id = pce.player_id
        JOIN characters c ON c.character_id = pce.character_id
        ORDER BY p.name, c.name
    `;
    return allQuery(sql);
};

// Match Functions
const logMatch = (p1Id, p1CharId, p2Id, p2CharId, winnerPlayerId) => {
    const sql = `
        INSERT INTO matches (player1_id, player1_character_id, player2_id, player2_character_id, winner_player_id)
        VALUES (?, ?, ?, ?, ?)
    `;
    return runQuery(sql, [p1Id, p1CharId, p2Id, p2CharId, winnerPlayerId]);
};

const getMatchHistoryWithNames = () => {
    const sql = `
        SELECT
            m.match_id,
            m.match_date,
            p1.name as player1Name,
            c1.name as player1CharacterName,
            p2.name as player2Name,
            c2.name as player2CharacterName,
            wp.name as winnerName
        FROM matches m
        JOIN players p1 ON m.player1_id = p1.player_id
        JOIN characters c1 ON m.player1_character_id = c1.character_id
        JOIN players p2 ON m.player2_id = p2.player_id
        JOIN characters c2 ON m.player2_character_id = c2.character_id
        LEFT JOIN players wp ON m.winner_player_id = wp.player_id -- LEFT JOIN in case winner_player_id can be null
        ORDER BY m.match_date DESC
    `;
    return allQuery(sql);
};


module.exports = {
    initDb,
    getPlayers,
    getOrCreatePlayer,
    getCharacters,
    getOrCreateCharacter,
    getPlayerCharacterElo,
    addPlayerCharacterElo,
    updatePlayerCharacterElo,
    getOrCreatePlayerCharacterElo,
    getAllPlayerCharacterElosWithNames,
    logMatch,
    getMatchHistoryWithNames,
};