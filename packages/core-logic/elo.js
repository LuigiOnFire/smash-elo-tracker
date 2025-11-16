// This file is MOVED from src/elo/elo.js
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

// NEW: Export all functions as a single object
module.exports = {
    K_FACTOR,
    expectedScore,
    calculateNewElo,
    calculateNewElos,
};