require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const snmp = require('net-snmp');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

// Configurações do .env
const {
  MIKROTIK_HOST,
  INTERFACE_OID_INDEX = '2', 
  SNMP_COMMUNITY = 'public',
  POLL_INTERVAL_MS = 1000,
  SERVER_PORT = 3000
} = process.env;

const oidRx = `1.3.6.1.2.1.31.1.1.1.6.${INTERFACE_OID_INDEX}`;
const oidTx = `1.3.6.1.2.1.31.1.1.1.10.${INTERFACE_OID_INDEX}`;

let session = null;
let pollInterval = parseInt(POLL_INTERVAL_MS, 10) || 1000;

let previous = { rx: 0, tx: 0, time: 0 };

function createSession() {
  if (session) {
    try { session.close(); } catch(e){}
  }
  session = snmp.createSession(MIKROTIK_HOST, SNMP_COMMUNITY, {
    version: snmp.Version2c,
    timeout: 3000
  });
  console.log(`Sessão SNMP criada para ${MIKROTIK_HOST}`);
}

function parseSnmpValue(value) {
  if (Buffer.isBuffer(value)) {
    // Se o buffer já tem 8 bytes, lê direto
    if (value.length === 8) {
      return Number(value.readBigUInt64BE());
    }
    // Se for menor que 8 bytes (otimização do protocolo), preenche com zeros
    if (value.length < 8) {
      const padded = Buffer.alloc(8); // Cria buffer de 8 zeros
      value.copy(padded, 8 - value.length); // Copia o valor para o final (Big Endian)
      return Number(padded.readBigUInt64BE());
    }
  }
  return Number(value || 0);
}

function fetchSNMP(callback) {
  if (!session) createSession();

  const oids = [oidRx, oidTx];

  session.get(oids, (error, varbinds) => {
    if (error) {
      console.error('Erro SNMP:', error.toString());
      session = null; 
      return;
    }

    if (snmp.isVarbindError(varbinds[0]) || snmp.isVarbindError(varbinds[1])) {
      console.error('Erro OID. Verifique INTERFACE_OID_INDEX no .env');
      return;
    }

    const currentRxBytes = parseSnmpValue(varbinds[0].value);
    const currentTxBytes = parseSnmpValue(varbinds[1].value);
    const currentTime = Date.now();

  
    console.log(`SNMP -> Rx: ${currentRxBytes} | Tx: ${currentTxBytes}`);

    if (previous.time === 0) {
      previous = { rx: currentRxBytes, tx: currentTxBytes, time: currentTime };
      return;
    }

    const timeDiffSeconds = (currentTime - previous.time) / 1000;
    if (timeDiffSeconds < 0.1) return; 

    let diffRx = currentRxBytes - previous.rx;
    let diffTx = currentTxBytes - previous.tx;

    if (diffRx < 0) diffRx = 0;
    if (diffTx < 0) diffTx = 0;

    const rx_bps = (diffRx * 8) / timeDiffSeconds;
    const tx_bps = (diffTx * 8) / timeDiffSeconds;

    previous = { rx: currentRxBytes, tx: currentTxBytes, time: currentTime };

    callback({ rx_bps, tx_bps });
  });
}

io.on('connection', (socket) => {
  console.log('Cliente conectado (Web)');
  
  socket.emit('config', { 
    interface: `SNMP Index ${INTERFACE_OID_INDEX}`, 
    pollIntervalMs: pollInterval 
  });

  let running = true;
  const intervalHandle = setInterval(() => {
    if (!running) return;
    fetchSNMP((metrics) => {
      const now = Date.now();
      io.emit('metrics', {
        ts: now,
        rx_bps: metrics.rx_bps,
        tx_bps: metrics.tx_bps,
        rx_mbps: (metrics.rx_bps / 1e6),
        tx_mbps: (metrics.tx_bps / 1e6)
      });
    });
  }, pollInterval);

  socket.on('disconnect', () => {
    clearInterval(intervalHandle);
  });
});

server.listen(SERVER_PORT, () => {
  console.log(`Servidor rodando em http://localhost:${SERVER_PORT}`);
  createSession();
});