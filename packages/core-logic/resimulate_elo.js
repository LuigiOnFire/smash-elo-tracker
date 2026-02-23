import path from "path";
import sqlite3 from "sqlite3";

// ==========================================
// PART 1: Elo Logic (Copied from elo.js)
// ==========================================
const K_FACTOR = 32;

function expectedScore(eloA, eloB) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function calculateNewElo(currentElo, actualScore, expectedScoreVal) {
    return Math.round(currentElo + K_FACTOR * (actualScore - expectedScoreVal));
}

function calculateNewElos(eloA, eloB, scoreA) {
    const expectedA = expectedScore(eloA, eloB);
    const expectedB = expectedScore(eloB, eloA);
    const scoreB = 1 - scoreA;
    const newEloA = calculateNewElo(eloA, scoreA, expectedA);
    const newEloB = calculateNewElo(eloB, scoreB, expectedB);
    return { newEloA, newEloB };
}

// ==========================================
// PART 2: Database Service (Modified from database.js)
// ==========================================
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

    // --- Specific Helper for this script ---
    async getOrCreatePlayerCharacterElo(playerId, characterId) {
        // 1. Check if Elo exists
        const row = await this.getQuery(
            `SELECT * FROM player_character_elos
             WHERE player_id = ? AND character_id = ?`,
            [playerId, characterId]
        );

        if (row) return row;

        // 2. If not, compute average Elo over existing characters
        const avgRow = await this.getQuery(
            `SELECT AVG(elo) AS avgElo
             FROM player_character_elos
             WHERE player_id = ?`,
            [playerId]
        );

        const initialElo = avgRow?.avgElo != null
            ? Math.round(avgRow.avgElo)
            : this.DEFAULT_ELO;

        // 3. Insert new record
        await this.runQuery(
            `INSERT INTO player_character_elos
             (player_id, character_id, elo)
             VALUES (?, ?, ?)`,
            [playerId, characterId, initialElo]
        );

        return {
            player_id: playerId,
            character_id: characterId,
            elo: initialElo
        };
    }
}

// ==========================================
// PART 3: Main Resimulation Logic
// ==========================================

async function resimulate(dbPath) {
    console.log("Resimulating Elo from scratch:", dbPath);

    // Create Connection & Service
    const rawDb = new sqlite3.Database(dbPath);
    const db = new DatabaseService(rawDb);

    // Start Transaction
    await db.runQuery("PRAGMA foreign_keys = OFF");
    await db.runQuery("BEGIN TRANSACTION");

    try {
        console.log("Clearing Elo table...");
        await db.runQuery(`DELETE FROM player_character_elos`);

        const matches = await db.allQuery(
            `SELECT *
             FROM matches
             ORDER BY match_date ASC, match_id ASC`
        );

        console.log(`Replaying ${matches.length} matches...`);

        for (const match of matches) {
            // Get current Elo for both players (or create initial)
            const p1 = await db.getOrCreatePlayerCharacterElo(
                match.player1_id,
                match.player1_character_id
            );

            const p2 = await db.getOrCreatePlayerCharacterElo(
                match.player2_id,
                match.player2_character_id
            );

            // Determine Score
            let scoreP1; // 1 = P1 wins, 0 = P1 loses
            if (match.winner_player_id === match.player1_id) {
                scoreP1 = 1;
            } else if (match.winner_player_id === match.player2_id) {
                scoreP1 = 0;
            } else {
                continue; // Draw or invalid
            }

            // Calculate New Elos
            const { newEloA, newEloB } = calculateNewElos(p1.elo, p2.elo, scoreP1);

            // Update DB
            await db.runQuery(
                `UPDATE player_character_elos
                 SET elo = ?
                 WHERE player_id = ? AND character_id = ?`,
                [newEloA, match.player1_id, match.player1_character_id]
            );

            await db.runQuery(
                `UPDATE player_character_elos
                 SET elo = ?
                 WHERE player_id = ? AND character_id = ?`,
                [newEloB, match.player2_id, match.player2_character_id]
            );
        }

        await db.runQuery("COMMIT");
        console.log("Elo resimulation complete ✔");
        
        // Clean exit
        rawDb.close(); 

    } catch (err) {
        await db.runQuery("ROLLBACK");
        console.error("FAILED — rolled back", err);
        throw err;
    }
}

// ==========================================
// PART 4: CLI Entry Point
// ==========================================

const dbPath = process.argv[2];
if (!dbPath) {
    console.error("Usage: node resimulate_elo.js <path_to_sqlite_db>");
    process.exit(1);
}

resimulate(path.resolve(dbPath));