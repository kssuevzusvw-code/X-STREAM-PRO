const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: "X-Stream Pro",
    icon: fs.existsSync(path.join(__dirname, 'icon.ico')) ? path.join(__dirname, 'icon.ico') : undefined
  });

  // Start the backend server
  // Instead of requiring, we spawn it to keep it separate or just require it if it's safe.
  // Given server.js uses __dirname, requiring it should work fine.
  require('./server.js');

  // Load the local server
  // Wait a bit for the server to start
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
