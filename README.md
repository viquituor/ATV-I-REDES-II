# Mikrotik Bandwidth Monitor (Realtime)

Aplicação simples para monitorar Rx/Tx (Mbps) de uma interface Mikrotik em tempo real.
Backend em Node.js que conecta via SSH ao Mikrotik e executa `/interface/monitor-traffic <iface> once`.
Frontend simples com Chart.js e socket.io para exibir gráfico em tempo real.

## Como usar

1. Instale Node.js (LTS).
2. Faça `npm install`.
3. Copie `.env.example` para `.env` e edite com seu host/máquinas.
4. Rode `npm start`.
5. Abra `http://localhost:3000`.

## Teste de tráfego

Gere tráfego no Mikrotik com Tools → Bandwidth Test ou use iperf3 entre duas máquinas para ver Rx/Tx no gráfico.

## Alternativa SNMP

Caso não queira usar SSH, altere o backend para consultar SNMP ifInOctets/ifOutOctets e calcular taxa.

## Segurança

Não use usuário `admin` com senha padrão em produção. Crie usuário limitado.
