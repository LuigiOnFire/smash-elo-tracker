// NEW FILE: Refactored from src/db/database.js
const EloCalculator = require('./elo.js');

class DatabaseService {
    constructor(db) {
        if (!db) {
            throw new Error("A sqlite3.Database instance must be provided.");
        }
        this.db = db;
        this.DEFAULT_ELO = 1500;
    }

    // --- Private Helper Methods ---
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) {
                    console.error('Error running SQL:', sql, params, err);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }
    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('Error running SQL GET:', sql, params, err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error running SQL ALL:', sql, params, err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // ---ELO Helper---
    async getInitialEloForControlType(playerId, characterId, controlType) {
        // Function specification:
        // - If exists, the Elo of the same character with the other control type
        // - Else, the average Elo of all characters with the same control type
        // - Else, the average Elo of all characters with any control type

        // 1. Check if row already exists for this control type
        const existing = await this.getPlayerCharacterElo(playerId, characterId, controlType);
        if (existing) {
            return existing.elo;
        }

        // 2. Same character, other control type
        let alternate = null;
        if (controlType === "Classic") alternate = "Modern";
        else if (controlType === "Modern") alternate = "Classic";
                
        if(alternate) {
            const altEloRow = await this.getPlayerCharacterElo(playerId, characterId, alternate);
            if (altEloRow) {
                return altEloRow.elo;
            }
        }
        
        // 3. Use the average of all rows with the same control type
        const sameControlAvg = await this.getQuery(
            `SELECT AVG(elo) as avgElo
            FROM player_character_elos
            WHERE player_id = ? AND control_type = ?`,
            [playerId, controlType]
        );
        if (sameControlAvg.avgElo != null) {
            return Math.round(sameControlAvg.avgElo);
        }

        // 4. Average of all characters for this player with any control type
        const anyControlAvg = await this.getQuery(
            `SELECT AVG(elo) as avgElo
            FROM player_character_elos
            WHERE player_id = ?`,
            [playerId]
        );

        if (anyControlAvg.avgElo != null) {
            return Math.round(anyControlAvg.avgElo);
        }

        // 5. Fallback to default
        return this.DEFAULT_ELO;
    }   

    // --- Schema Initialization ---
    initDb(samplePlayers = [], sampleCharacters = []) {
        return new Promise((resolve, reject) => {
            this.db.serialize(async () => {
                try {
                    await this.runQuery(`CREATE TABLE IF NOT EXISTS players (
                        player_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL
                    )`);
                    await this.runQuery(`CREATE TABLE IF NOT EXISTS characters (
                        character_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL
                    )`);
                    await this.runQuery(`CREATE TABLE IF NOT EXISTS player_character_elos (
                        pc_elo_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        player_id INTEGER NOT NULL,
                        character_id INTEGER NOT NULL,
                        control_type TEXT NOT NULL CHECK(control_type IN ('Classic','Modern','N/A')) DEFAULT 'Classic',
                        elo INTEGER DEFAULT 1500,
                        FOREIGN KEY (player_id) REFERENCES players(player_id),
                        FOREIGN KEY (character_id) REFERENCES characters(character_id),
                        UNIQUE (player_id, character_id, control_type)
                    )`);
                    await this.runQuery(`CREATE TABLE IF NOT EXISTS matches (
                        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        player1_id INTEGER NOT NULL, player1_character_id INTEGER NOT NULL,
                        player2_id INTEGER NOT NULL, player2_character_id INTEGER NOT NULL,
                        winner_player_id INTEGER,
                        match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (player1_id) REFERENCES players(player_id),
                        FOREIGN KEY (player1_character_id) REFERENCES characters(character_id),
                        FOREIGN KEY (player2_id) REFERENCES players(player_id),
                        FOREIGN KEY (player2_character_id) REFERENCES characters(character_id)
                    )`);

                    // Populate initial data only if tables are empty
                    const players = await this.getPlayers();
                    if (players.length === 0) {
                        for (const name of samplePlayers) { await this.getOrCreatePlayer(name); }
                    }
                    const chars = await this.getCharacters();
                    if (chars.length === 0) {
                        for (const name of sampleCharacters) { await this.getOrCreateCharacter(name); }
                    }
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    // --- Public Getters ---
    getPlayers = () => this.allQuery("SELECT * FROM players ORDER BY name");
    getCharacters = () => this.allQuery("SELECT * FROM characters ORDER BY name");
    getPlayerByName = (name) => this.getQuery("SELECT * FROM players WHERE name = ?", [name]);
    getCharacterByName = (name) => this.getQuery("SELECT * FROM characters WHERE name = ?", [name]);
    getMatchById = (matchId) => this.getQuery("SELECT * FROM matches WHERE match_id = ?", [matchId]);

    getOrCreatePlayer = async (name) => {
        let player = await this.getPlayerByName(name);
        if (!player) {
            const { lastID } = await this.runQuery("INSERT INTO players (name) VALUES (?)", [name]);
            player = { player_id: lastID, name: name };
        }
        return player;
    };

    getOrCreateCharacter = async (name) => {
        let character = await this.getCharacterByName(name);
        if (!character) {
            const { lastID } = await this.runQuery("INSERT INTO characters (name) VALUES (?)", [name]);
            character = { character_id: lastID, name: name };
        }
        return character;
    };

    getPlayerCharacterElo = (playerId, characterId, controlType) => {
        return this.getQuery("SELECT * FROM player_character_elos WHERE player_id = ? AND character_id = ? AND control_type = ?", [playerId, characterId, controlType]);
    };

    getOrCreatePlayerCharacterElo = async (playerId, characterId, controlType) => {
        let pcElo = await this.getPlayerCharacterElo(playerId, characterId, controlType);
        
        if (!pcElo) {
            // CPUs (N/As) keep default
            let initialElo = controlType === 'N/A'
                ? this.DEFAULT_ELO
                : await this.getInitialEloForControlType(playerId, characterId, controlType);
        
            const { lastID } = await this.runQuery(
                "INSERT INTO player_character_elos (player_id, character_id, control_type, elo) VALUES (?, ?, ?, ?)",   
                [playerId, characterId, controlType, initialElo]
            );
            pcElo = { pc_elo_id: lastID, player_id: playerId, character_id: characterId, control_type: controlType, elo: initialElo };
        }
        return pcElo;
    };

    updatePlayerCharacterElo = (pcEloId, newElo) => {
        return this.runQuery("UPDATE player_character_elos SET elo = ? WHERE pc_elo_id = ?", [newElo, pcEloId]);
    };

    getAllPlayerCharacterElosWithNames = () => {
        return this.allQuery(`
            SELECT p.name as playerName, c.name as characterName, pce.control_type as controlType, pce.elo, pce.pc_elo_id,
            (
                SELECT COUNT(*)
                FROM matches m
                WHERE (pce.player_id = m.player1_id AND pce.character_id = m.player1_character_id AND pce.control_type = m.player1_control_type)
                OR 
                (pce.player_id = m.player2_id AND pce.character_id = m.player2_character_id AND pce.control_type = m.player2_control_type)
            ) as matchCount
            FROM player_character_elos pce
            JOIN players p ON p.player_id = pce.player_id
            JOIN characters c ON c.character_id = pce.character_id
            ORDER BY p.name, c.name
        `);
    };

    getMatchHistoryWithNames = () => {
        return this.allQuery(`
            SELECT m.match_id, m.match_date, p1.name as player1Name, c1.name as player1CharacterName, m.player1_control_type as player1ControlType,
                   p2.name as player2Name, c2.name as player2CharacterName, m.player2_control_type as player2ControlType, wp.name as winnerName
            FROM matches m
            JOIN players p1 ON m.player1_id = p1.player_id
            JOIN characters c1 ON m.player1_character_id = c1.character_id
            JOIN players p2 ON m.player2_id = p2.player_id
            JOIN characters c2 ON m.player2_character_id = c2.character_id
            LEFT JOIN players wp ON m.winner_player_id = wp.player_id
            ORDER BY m.match_date DESC
        `);
    };

    // --- Business Logic / Transactions ---
    // This logic was moved from main.js to be reusable
    async submitMatchTransaction(matchData) {
        const { player1Name, player1CharName, player1ControlType, player2Name, player2CharName, player2ControlType, winnerName } = matchData;

        // 1 & 2. Get or create
        const p1 = await this.getOrCreatePlayer(player1Name);
        const c1 = await this.getOrCreateCharacter(player1CharName);
        const p2 = await this.getOrCreatePlayer(player2Name);
        const c2 = await this.getOrCreateCharacter(player2CharName);

        // 3. Get or create Elos
        let p1EloData = await this.getOrCreatePlayerCharacterElo(p1.player_id, c1.character_id, player1ControlType);
        let p2EloData = await this.getOrCreatePlayerCharacterElo(p2.player_id, c2.character_id, player2ControlType);

        // 4. Scores
        const score1 = (winnerName === player1Name) ? 1 : 0;

        // 5. Calculate new Elos (using the imported EloCalculator)
        const { newEloA: newP1Elo, newEloB: newP2Elo } = EloCalculator.calculateNewElos(p1EloData.elo, p2EloData.elo, score1);

        // 6. Update Elos
        await this.updatePlayerCharacterElo(p1EloData.pc_elo_id, newP1Elo);
        await this.updatePlayerCharacterElo(p2EloData.pc_elo_id, newP2Elo);

        // 7. Log match
        const winnerPlayerId = (winnerName === player1Name) ? p1.player_id : p2.player_id;
        await this.runQuery(
            `INSERT INTO matches (player1_id, player1_character_id, player1_control_type, player2_id, player2_character_id, player2_control_type, winner_player_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [p1.player_id, c1.character_id, player1ControlType, p2.player_id, c2.character_id, player2ControlType, winnerPlayerId]
        );
        return { success: true, message: 'Match logged and Elos updated!' };
    }

    // This logic was also moved from main.js (from the delete-match prompt)
    async deleteMatchTransaction(matchId) {
        const matchToDelete = await this.getMatchById(matchId);
        if (!matchToDelete) {
            throw new Error('Match not found.');
        }

        const p1Id = matchToDelete.player1_id;
        const p1CharId = matchToDelete.player1_character_id;
        const p1ControlType = matchToDelete.player1_control_type;
        const p2Id = matchToDelete.player2_id;
        const p2CharId = matchToDelete.player2_character_id;
        const p2ControlType = matchToDelete.player2_control_type;

        await this.runQuery("DELETE FROM matches WHERE match_id = ?", [matchId]);

        // Recalculate Elos for both player-characters involved
        await this.recalculateEloForPlayerCharacter(p1Id, p1CharId, p1ControlType);
        await this.recalculateEloForPlayerCharacter(p2Id, p2CharId, p2ControlType);

        return { success: true, message: 'Match deleted and Elos recalculated.' };
    }

    async recalculateEloForPlayerCharacter(targetPlayerId, targetCharacterId, targetControlType) {
        let currentElo = this.DEFAULT_ELO;
        const K = EloCalculator.K_FACTOR;

        const sql = `
            SELECT m.*,
                CASE WHEN m.player1_id = ? AND m.player1_character_id = ? AND m.player1_control_type = ? THEN m.player2_id ELSE m.player1_id END as opp_id,
                CASE WHEN m.player1_id = ? AND m.player1_character_id = ? AND m.player1_control_type = ? THEN m.player2_character_id ELSE m.player1_character_id END as opp_char_id,
                CASE WHEN m.winner_player_id = ? THEN 1 ELSE 0 END as score
            FROM matches m
            WHERE (m.player1_id = ? AND m.player1_character_id = ? AND m.player1_control_type = ?) OR (m.player2_id = ? AND m.player2_character_id = ? AND m.player2_control_type = ?)
            ORDER BY m.match_date ASC, m.match_id ASC
        `;
        const params = [
            targetPlayerId, targetCharacterId, targetControlType, 
            targetPlayerId, targetCharacterId, targetControlType, 
            targetPlayerId,
            targetPlayerId, targetCharacterId, targetControlType, 
            targetPlayerId, targetCharacterId, targetControlType
        ];
        const matches = await this.allQuery(sql, params);

        for (const match of matches) {
            const opponentPcEloData = await this.getOrCreatePlayerCharacterElo(match.opp_id, match.opp_char_id, targetControlType);
            const expectedScore = EloCalculator.expectedScore(currentElo, opponentPcEloData.elo);
            currentElo = currentElo + K * (match.score - expectedScore);
        }

        const finalElo = Math.round(currentElo);
        const pcEloDataToUpdate = await this.getOrCreatePlayerCharacterElo(targetPlayerId, targetCharacterId, targetControlType);
        await this.updatePlayerCharacterElo(pcEloDataToUpdate.pc_elo_id, finalElo);
        return finalElo;
    }
}

module.exports = DatabaseService;