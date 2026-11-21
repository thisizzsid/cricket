'use strict';

const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 4173);
const dataFile = path.join(__dirname, 'matches.json');
const clients = new Map();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

function readMatches() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeMatches(matches) {
  fs.writeFileSync(dataFile, JSON.stringify(matches, null, 2));
}

function sendUpdate(id) {
  const message = `data: ${JSON.stringify(readMatches()[id] || null)}\n\n`;
  for (const client of clients.get(id) || []) {
    client.write(message);
  }
}

app.get('/api/matches/:id', (req, res) => {
  const match = readMatches()[req.params.id];
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

app.post('/api/matches', (req, res) => {
  const id = req.body.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const matches = readMatches();
  matches[id] = { ...req.body, id, updatedAt: Date.now() };
  writeMatches(matches);
  sendUpdate(id);
  res.status(201).json(matches[id]);
});

app.put('/api/matches/:id', (req, res) => {
  const matches = readMatches();
  if (!matches[req.params.id]) return res.status(404).json({ error: 'Match not found' });
  matches[req.params.id] = { ...req.body, id: req.params.id, updatedAt: Date.now() };
  writeMatches(matches);
  sendUpdate(req.params.id);
  res.json(matches[req.params.id]);
});

app.get('/api/matches/:id/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const id = req.params.id;
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id).add(res);
  res.write(`data: ${JSON.stringify(readMatches()[id] || null)}\n\n`);
  req.on('close', () => clients.get(id)?.delete(res));
});

app.get('/api/matches/:id/qr', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    const svg = await QRCode.toString(url, { type: 'svg', width: 320, margin: 2 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch {
    res.status(500).json({ error: 'Could not create QR code' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Cricket Score Manager: http://localhost:${port}`);
});
