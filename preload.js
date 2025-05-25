const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Database related
    getPlayers: () => ipcRenderer.invoke('db:get-players'),
    getCharacters: () => ipcRenderer.invoke('db:get-characters'),
    getAllPcElos: () => ipcRenderer.invoke('db:get-all-pc-elos'),
    getMatchHistory: () => ipcRenderer.invoke('db:get-match-history'),
    submitMatch: (matchData) => ipcRenderer.invoke('db:submit-match', matchData),
});