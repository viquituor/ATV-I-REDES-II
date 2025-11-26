const socket = io();

const hostLabel = document.getElementById('hostLabel');
const ifaceLabel = document.getElementById('ifaceLabel');
const ifaceSelect = document.getElementById('ifaceSelect');
const pauseBtn = document.getElementById('pauseBtn');
const connStatus = document.getElementById('connStatus');
const lastRead = document.getElementById('lastRead');

let paused = false;
let config = { interface: 'ether1', pollIntervalMs: 1000 };

const ctx = document.getElementById('bwChart').getContext('2d');
const maxPoints = 60;
const data = {
  labels: Array(maxPoints).fill(''),
  datasets: [
    { label: 'Rx (Mbps)', data: Array(maxPoints).fill(null), fill:false, borderWidth:2, tension:0.3 },
    { label: 'Tx (Mbps)', data: Array(maxPoints).fill(null), fill:false, borderWidth:2, tension:0.3 }
  ]
};
const chart = new Chart(ctx, {
  type: 'line',
  data,
  options: {
    animation: false,
    scales: {
      x: { display: true, title: { display: true, text: 'Tempo' } },
      y: { display: true, title: { display: true, text: 'Mbps' } }
    }
  }
});

socket.on('connect', () => {
  connStatus.textContent = 'Conectado';
});
socket.on('disconnect', () => {
  connStatus.textContent = 'Desconectado';
});

socket.on('config', (c) => {
  config = {...config, ...c};
  ifaceLabel.textContent = config.interface;
  hostLabel.textContent = window.location.hostname || 'router';
  ifaceSelect.value = config.interface || ifaceSelect.value;
});

socket.on('metrics', (m) => {
  const time = new Date(m.ts);
  lastRead.textContent = time.toLocaleTimeString();
  data.labels.push(time.toLocaleTimeString());
  data.labels.shift();
  data.datasets[0].data.push(Number((m.rx_mbps || 0).toFixed(3)));
  data.datasets[0].data.shift();
  data.datasets[1].data.push(Number((m.tx_mbps || 0).toFixed(3)));
  data.datasets[1].data.shift();
  chart.update('none');
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  if (paused) {
    pauseBtn.textContent = 'Retomar';
    socket.emit('pause');
  } else {
    pauseBtn.textContent = 'Pausar';
    socket.emit('resume');
  }
});

ifaceSelect.addEventListener('change', (e) => {
  ifaceLabel.textContent = e.target.value;
});
