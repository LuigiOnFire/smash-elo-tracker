import path from "path";
import sqlite3 from "sqlite3";

// --- Helper to use async/await with sqlite3 ---
function createDbHelper(db) {
    return {
        run: (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this); })),
        get: (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row))),
        all: (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))),
        close: () => new Promise((res, rej) => db.close(err => err ? rej(err) : res()))
    };
}

const PLAYER_NAME_TO_MOVE = "CPU 7";

async function movePlayerMatches(sourcePath, targetPath) {
    console.log(`\n▶ Starting extraction for: "${PLAYER_NAME_TO_MOVE}"`);
    console.log(`  Source DB: ${sourcePath}`);
    console.log(`  Target DB: ${targetPath}\n`);

    const sourceDb = createDbHelper(new sqlite3.Database(sourcePath));
    const targetDb = createDbHelper(new sqlite3.Database(targetPath));

    try {
        await targetDb.run(`CREATE TABLE IF NOT EXISTS players (player_id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)`);
        await targetDb.run(`CREATE TABLE IF NOT EXISTS characters (character_id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)`);
        await targetDb.run(`CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY,
            player1_id INTEGER NOT NULL, player1_character_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL, player2_character_id INTEGER NOT NULL,
            winner_player_id INTEGER,
            match_date DATETIME
        )`);

        const cpuPlayer = await sourceDb.get(`SELECT player_id FROM players WHERE name = ?`, [PLAYER_NAME_TO_MOVE]);
        if (!cpuPlayer) {
            console.log(`❌ Player "${PLAYER_NAME_TO_MOVE}" not found in source database. Exiting.`);
            return;
        }
        
        const cpuId = cpuPlayer.player_id;
        const matches = await sourceDb.all(`SELECT * FROM matches WHERE player1_id = ? OR player2_id = ?`, [cpuId, cpuId]);

        if (matches.length === 0) {
            console.log(`⚠️ No matches found for "${PLAYER_NAME_TO_MOVE}".`);
            return;
        }
        
        console.log(`Found ${matches.length} matches to move. Copying data...`);

        const playerIds = new Set();
        const characterIds = new Set();
        
        for (const m of matches) {
            playerIds.add(m.player1_id).add(m.player2_id);
            if (m.winner_player_id) playerIds.add(m.winner_player_id);
            characterIds.add(m.player1_character_id).add(m.player2_character_id);
        }

        await targetDb.run("BEGIN TRANSACTION");
        await sourceDb.run("BEGIN TRANSACTION");

        for (const pid of playerIds) {
            const p = await sourceDb.get(`SELECT * FROM players WHERE player_id = ?`, [pid]);
            if (p) await targetDb.run(`INSERT OR IGNORE INTO players (player_id, name) VALUES (?, ?)`, [p.player_id, p.name]);
        }

        for (const cid of characterIds) {
            const c = await sourceDb.get(`SELECT * FROM characters WHERE character_id = ?`, [cid]);
            if (c) await targetDb.run(`INSERT OR IGNORE INTO characters (character_id, name) VALUES (?, ?)`, [c.character_id, c.name]);
        }

        for (const m of matches) {
            await targetDb.run(
                `INSERT OR IGNORE INTO matches 
                (match_id, player1_id, player1_character_id, player2_id, player2_character_id, winner_player_id, match_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [m.match_id, m.player1_id, m.player1_character_id, m.player2_id, m.player2_character_id, m.winner_player_id, m.match_date]
            );
            await sourceDb.run(`DELETE FROM matches WHERE match_id = ?`, [m.match_id]);
        }

        await targetDb.run("COMMIT");
        await sourceDb.run("COMMIT");

        console.log(`✅ Successfully moved ${matches.length} matches!`);
        console.log(`⚠️ WARNING: Now run your resimulate script on the main database to fix the Elo ratings!`);

    } catch (err) {
        await targetDb.run("ROLLBACK").catch(() => {});
        await sourceDb.run("ROLLBACK").catch(() => {});
        console.error("❌ An error occurred. Rolled back changes.", err);
    } finally {
        await sourceDb.close();
        await targetDb.close();
    }
}

// --- CLI Entry with Top-Level Await ---
const sourceDbPath = process.argv[2];
const targetDbPath = process.argv[3];

if (!sourceDbPath || !targetDbPath) {
    console.error("Usage: node move.mjs <path_to_source_db> <path_to_target_db>");
    process.exit(1);
}

// Top-level await forces Node to wait for the entire process to finish
await movePlayerMatches(path.resolve(sourceDbPath), path.resolve(targetDbPath));