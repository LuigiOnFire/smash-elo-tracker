const player1NameInput = document.getElementById('player1Name');
const player1CharacterInput = document.getElementById('player1Character');
const player2NameInput = document.getElementById('player2Name');
const player2CharacterInput = document.getElementById('player2Character');
const winnerSelect = document.getElementById('winner');
const matchForm = document.getElementById('matchForm');
const matchStatus = document.getElementById('matchStatus');

const eloTableBody = document.getElementById('eloTable').getElementsByTagName('tbody')[0];
const matchHistoryTableBody = document.getElementById('matchHistoryTable').getElementsByTagName('tbody')[0];

const playerDatalist = document.getElementById('playerList');
const characterDatalist = document.getElementById('characterList');

// Filters
const filterPlayerEloInput = document.getElementById('filterPlayerElo');
const filterCharacterEloInput = document.getElementById('filterCharacterElo');
const filterPlayerHistoryInput = document.getElementById('filterPlayerHistory');

let currentPlayers = [];
let currentCharacters = [];
let currentElos = [];
let processedElos = [];
let currentMatchHistory = [];

// --- Data Loading and Refreshing ---
async function populateDatalists() {
    try {
        currentPlayers = await window.electronAPI.getPlayers();
        currentCharacters = await window.electronAPI.getCharacters();

        playerDatalist.innerHTML = currentPlayers.map(p => `<option value="${p.name}"></option>`).join('');
        characterDatalist.innerHTML = currentCharacters.map(c => `<option value="${c.name}"></option>`).join('');
    } catch (error) {
        console.error("Error populating datalists:", error);
    }
}

function updateWinnerDropdown() {
    const p1Name = player1NameInput.value.trim();
    const p2Name = player2NameInput.value.trim();
    winnerSelect.innerHTML = '<option value="" disabled selected>Select Winner</option>';

    if (p1Name) {
        const option1 = document.createElement('option');
        option1.value = p1Name;
        option1.textContent = p1Name;
        winnerSelect.appendChild(option1);
    }
    if (p2Name && p2Name !== p1Name) {
        const option2 = document.createElement('option');
        option2.value = p2Name;
        option2.textContent = p2Name;
        winnerSelect.appendChild(option2);
    }
}

function processElos(inElos) {
    const BASE_SIGMA = 250;
    return inElos.map(e => {
        const uncertainty = BASE_SIGMA / Math.sqrt(e.matchCount);
        const minElo = e.elo - uncertainty;

        return {
            ...e,
            minElo: minElo
        };
    });
}

async function refreshEloTable() {
    try {
        currentElos = await window.electronAPI.getAllPcElos();
        processedElos = processElos(currentElos) // Adds calculated metadata to the Elo array, namely uncertainty and Min Elo
        renderEloTable(processedElos);
    } catch (error) {
        console.error("Error refreshing Elo table:", error);
        eloTableBody.innerHTML = `<tr><td colspan="3">Error loading Elo data: ${error.message}</td></tr>`;
    }
}

function renderEloTable(elos) {
    const playerFilter = filterPlayerEloInput.value.toLowerCase();
    const charFilter = filterCharacterEloInput.value.toLowerCase();

    const filteredElos = elos.filter(e =>
        e.playerName.toLowerCase().includes(playerFilter) &&
        e.characterName.toLowerCase().includes(charFilter)
    );

    eloTableBody.innerHTML = filteredElos.map(e => `
        <tr>
            <td>${e.playerName}</td>
            <td>${e.characterName}</td>
            <td>${e.elo}</td>
            <td>${e.matchCount}</td>
            <td>${e.minElo.toFixed(1)}</td>
        </tr>
    `).join('');
}


async function refreshMatchHistory() {
    try {
        currentMatchHistory = await window.electronAPI.getMatchHistory();
        renderMatchHistoryTable(currentMatchHistory);
    } catch (error) {
        console.error("Error refreshing match history:", error);
        matchHistoryTableBody.innerHTML = `<tr><td colspan="6">Error loading match history: ${error.message}</td></tr>`;
    }
}

function renderMatchHistoryTable(history) {
    const playerFilter = filterPlayerHistoryInput.value.toLowerCase();

    const filteredHistory = history.filter(m =>
        m.player1Name.toLowerCase().includes(playerFilter) ||
        m.player2Name.toLowerCase().includes(playerFilter) ||
        (m.winnerName && m.winnerName.toLowerCase().includes(playerFilter))
    );

    matchHistoryTableBody.innerHTML = filteredHistory.map(m => `
        <tr>
            <td>${new Date(m.match_date).toLocaleString()}</td>
            <td>${m.player1Name}</td>
            <td>${m.player1CharacterName}</td>
            <td>${m.player2Name}</td>
            <td>${m.player2CharacterName}</td>
            <td>${m.winnerName || 'N/A'}</td>
        </tr>
    `).join('');
}


// --- Event Listeners ---
player1NameInput.addEventListener('input', updateWinnerDropdown);
player2NameInput.addEventListener('input', updateWinnerDropdown);

matchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    matchStatus.textContent = 'Processing...';

    const matchData = {
        player1Name: player1NameInput.value.trim(),
        player1CharName: player1CharacterInput.value.trim(),
        player2Name: player2NameInput.value.trim(),
        player2CharName: player2CharacterInput.value.trim(),
        winnerName: winnerSelect.value,
    };

    if (matchData.player1Name === matchData.player2Name) {
        matchStatus.textContent = 'Error: Player 1 and Player 2 cannot be the same.';
        matchStatus.style.color = 'red';
        return;
    }
    if (!matchData.winnerName) {
        matchStatus.textContent = 'Error: Please select a winner.';
        matchStatus.style.color = 'red';
        return;
    }


    try {
        const result = await window.electronAPI.submitMatch(matchData);
        if (result.success) {
            matchStatus.textContent = result.message;
            matchStatus.style.color = 'green';
            matchForm.reset();
            winnerSelect.innerHTML = '<option value="" disabled selected>Select Winner</option>'; // Reset winner dropdown
            // Refresh all data
            await populateDatalists(); // In case new players/chars were added
            await refreshEloTable();
            await refreshMatchHistory();
        } else {
            matchStatus.textContent = `Error: ${result.message}`;
            matchStatus.style.color = 'red';
        }
    } catch (error) {
        console.error('Error submitting match from renderer:', error);
        matchStatus.textContent = `Error: ${error.message || 'Unknown error'}`;
        matchStatus.style.color = 'red';
    }
});

// Sorting for tables
document.querySelectorAll('th[data-sort]').forEach(headerCell => {
    headerCell.addEventListener('click', () => {
        const tableElement = headerCell.closest('table');
        const headerKey = headerCell.dataset.sort;
        const isAscending = headerCell.classList.contains('sorted-asc');
        const isMatchHistory = tableElement.id === 'matchHistoryTable';

        // Reset other headers sort indicators
        tableElement.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        if (isAscending) {
            headerCell.classList.add('sorted-desc');
        } else {
            headerCell.classList.add('sorted-asc');
        }

        const sortData = (data) => {
            data.sort((a, b) => {
                let valA = a[headerKey];
                let valB = b[headerKey];

                if (headerKey === 'elo' || headerKey === 'matchCount' || headerKey === 'minElo' || (headerKey === 'match_date' && isMatchHistory)) {
                    valA = (headerKey === 'match_date') ? new Date(valA) : Number(valA);
                    valB = (headerKey === 'match_date') ? new Date(valB) : Number(valB);
                    return isAscending ? valB - valA : valA - valB; // Numerical sort, asc/desc toggle
                } else { // String sort
                    valA = String(valA).toLowerCase();
                    valB = String(valB).toLowerCase();
                    if (valA < valB) return isAscending ? 1 : -1;
                    if (valA > valB) return isAscending ? -1 : 1;
                    return 0;
                }
            });
        };

        if (isMatchHistory) {
            sortData(currentMatchHistory);
            renderMatchHistoryTable(currentMatchHistory);
        } else { // Elo Table
            sortData(processedElos);
            renderEloTable(processedElos);
        }
    });
});

// Filter listeners
filterPlayerEloInput.addEventListener('input', () => renderEloTable(currentElos));
filterCharacterEloInput.addEventListener('input', () => renderEloTable(currentElos));
filterPlayerHistoryInput.addEventListener('input', () => renderMatchHistoryTable(currentMatchHistory));


// --- Initial Load ---
async function initializeApp() {
    await populateDatalists();
    await refreshEloTable();
    await refreshMatchHistory();
    updateWinnerDropdown(); // Initial call
}

initializeApp();