require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

const {
  MIKROTIK_HOST,
  MIKROTIK_PORT = 22,
  MIKROTIK_USER,
  MIKROTIK_PASS,
  INTERFACE_NAME = 'ether1',
  POLL_INTERVAL_MS = 1000,
  SERVER_PORT = 3000
} = process.env;

let ssh = null;
let pollInterval = parseInt(POLL_INTERVAL_MS, 10) || 1000;

function connectSSH() {
  if (ssh) {
    try { ssh.end(); } catch(e){}
    ssh = null;
  }
  ssh = new Client();
  ssh.on('ready', () => {
    console.log('SSH conectado ao Mikrotik');
  }).on('error', (err) => {
    console.error('Erro SSH:', err.message);
  }).on('end', () => {
    console.log('SSH finalizado');
  }).connect({
    host: MIKROTIK_HOST,
    port: Number(MIKROTIK_PORT),
    username: MIKROTIK_USER,
    password: MIKROTIK_PASS,
    readyTimeout: 20000
  });
}

function parseMonitorOutput(raw) {
  const rxMatch = raw.match(/rx-bits-per-second[:\s]+([0-9]+)/i);
  const txMatch = raw.match(/tx-bits-per-second[:\s]+([0-9]+)/i);
  if (rxMatch && txMatch) {
    const rx = Number(rxMatch[1]);
    const tx = Number(txMatch[1]);
    return { rx_bps: rx, tx_bps: tx };
  }
  const rxMbMatch = raw.match(/Rx[:\s]+([0-9.,]+)\s*Mb/i);
  const txMbMatch = raw.match(/Tx[:\s]+([0-9.,]+)\s*Mb/i);
  if (rxMbMatch && txMbMatch) {
    const rx = parseFloat(rxMbMatch[1].replace(',', '.')) * 1e6;
    const tx = parseFloat(txMbMatch[1].replace(',', '.')) * 1e6;
    return { rx_bps: rx, tx_bps: tx };
  }
  return null;
}

function doMonitorOnce(callback) {
  if (!ssh) {
    console.log('SSH não conectado. Tentando conectar...');
    connectSSH();
    setTimeout(()=>{}, 500);
    return;
  }
  try {
    ssh.exec(`/interface monitor-traffic ${INTERFACE_NAME} once`, (err, stream) => {
      if (err) {
        console.error('Erro exec:', err.message);
        return;
      }
      let data = '';
      stream.on('data', chunk => data += chunk.toString());
      stream.on('close', () => {
        const parsed = parseMonitorOutput(data);
        if (parsed) {
          callback(parsed);
        } else {
          console.warn('Não foi possível parsear resposta do monitor-traffic:', data);
        }
      });
    });
  } catch (e) {
    console.error('Erro ao executar comando SSH:', e.message);
  }
}

io.on('connection', (socket) => {
  console.log('Cliente conectado via socket.io:', socket.id);
  socket.emit('config', { interface: INTERFACE_NAME, pollIntervalMs: pollInterval });

  let running = true;
  const intervalHandle = setInterval(() => {
    if (!running) return;
    doMonitorOnce((v) => {
      const now = Date.now();
      io.emit('metrics', {
        ts: now,
        rx_bps: v.rx_bps,
        tx_bps: v.tx_bps,
        rx_mbps: (v.rx_bps / 1e6),
        tx_mbps: (v.tx_bps / 1e6)
      });
    });
  }, pollInterval);

  socket.on('pause', () => { running = false; });
  socket.on('resume', () => { running = true; });

  socket.on('disconnect', () => {
    clearInterval(intervalHandle);
    console.log('Cliente desconectado', socket.id);
  });
});

server.listen(SERVER_PORT, () => {
  console.log(`Servidor rodando em http://localhost:${SERVER_PORT}`);
  connectSSH();
});
