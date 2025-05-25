const K_FACTOR = 32;

/**
 * Calculates the expected score of player A against player B.
 * @param {number} eloA - Elo rating of player A.
 * @param {number} eloB - Elo rating of player B.
 * @returns {number} Expected score for player A (between 0 and 1).
 */
function expectedScore(eloA, eloB) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Calculates the new Elo rating for a player.
 * @param {number} currentElo - The player's current Elo rating.
 * @param {number} actualScore - The player's actual score (1 for win, 0.5 for draw, 0 for loss).
 * @param {number} expectedScoreVal - The player's expected score.
 * @returns {number} The new Elo rating, rounded to the nearest integer.
 */
function calculateNewElo(currentElo, actualScore, expectedScoreVal) {
    return Math.round(currentElo + K_FACTOR * (actualScore - expectedScoreVal));
}

/**
 * Calculates new Elo ratings for two players after a match.
 * @param {number} eloA - Player A's current Elo.
 * @param {number} eloB - Player B's current Elo.
 * @param {number} scoreA - Score for Player A (1 if A won, 0 if A lost).
 * @returns {{newEloA: number, newEloB: number}}
 */
function calculateNewElos(eloA, eloB, scoreA) {
    const expectedA = expectedScore(eloA, eloB);
    const expectedB = expectedScore(eloB, eloA); // or 1 - expectedA

    const scoreB = 1 - scoreA; // Assuming no draws for simplicity

    const newEloA = calculateNewElo(eloA, scoreA, expectedA);
    const newEloB = calculateNewElo(eloB, scoreB, expectedB);

    return { newEloA, newEloB };
}

module.exports = {
    expectedScore,
    calculateNewElo,
    calculateNewElos,
    K_FACTOR
};