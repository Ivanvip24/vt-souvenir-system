const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('armadoAPI', {
  processCommand: (filePath, command) =>
    ipcRenderer.invoke('armado:process', { filePath, command }),

  onStatus: (callback) =>
    ipcRenderer.on('armado:status', (_event, data) => callback(data)),

  // Get real file path from dropped file (Electron security requirement)
  getFilePath: (file) => webUtils.getPathForFile(file),

  // Save pasted image to temp file and return the path
  savePastedImage: (dataUrl) => ipcRenderer.invoke('armado:savePastedImage', dataUrl),
});
