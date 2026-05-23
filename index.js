require('dotenv').config();
const express = require('express');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { promisify } = require('util');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// --- Email storage ---
const emailsDir = path.join(__dirname, 'emails');
if (!fs.existsSync(emailsDir)) fs.mkdirSync(emailsDir);

// --- IMAP connection factory ---
function createImap() {
  return new Imap({
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
}

// --- SMTP transport ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// --- Helpers ---
function saveEmails(emails) {
  const file = path.join(emailsDir, 'emails.json');
  fs.writeFileSync(file, JSON.stringify(emails, null, 2));
}

function loadEmails() {
  const file = path.join(emailsDir, 'emails.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Fetch emails via IMAP with full parsing
function fetchEmails(limit = 20) {
  return new Promise((resolve, reject) => {
    const imap = createImap();
    const emails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        const total = box.messages.total;
        if (total === 0) { imap.end(); return resolve([]); }

        // Fetch last N messages
        const start = Math.max(1, total - limit + 1);
        const range = `${start}:${total}`;

        const fetch = imap.seq.fetch(range, { bodies: '' });

        fetch.on('message', (msg, seqno) => {
          const chunks = [];
          let uid = seqno;

          msg.on('attributes', attrs => { uid = attrs.uid || seqno; });
          msg.on('body', stream => {
            stream.on('data', chunk => chunks.push(chunk));
          });
          msg.once('end', () => {
            const raw = Buffer.concat(chunks);
            simpleParser(raw).then(parsed => {
              emails.push({
                id: uid,
                from: parsed.from?.text || '',
                to: parsed.to?.text || '',
                subject: parsed.subject || '(no subject)',
                date: parsed.date?.toISOString() || '',
                body: parsed.text || parsed.html || '',
              });
            }).catch(() => {});
          });
        });

        fetch.once('error', err => { imap.end(); reject(err); });
        fetch.once('end', () => {
          imap.end();
        });
      });
    });

    imap.once('end', () => resolve(emails));
    imap.once('error', reject);
    imap.connect();
  });
}

// --- Routes ---

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: {
      imap: !!process.env.EMAIL_USER,
      smtp: !!process.env.EMAIL_PASSWORD,
    },
  });
});

// 2. Fetch emails from IMAP and save locally
app.get('/api/emails', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const emails = await fetchEmails(limit);
    saveEmails(emails);
    res.json({ count: emails.length, emails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get locally cached emails
app.get('/api/emails/cached', (req, res) => {
  const emails = loadEmails();
  res.json({ count: emails.length, emails });
});

// 4. Get single email by id
app.get('/api/emails/:id', (req, res) => {
  const emails = loadEmails();
  const email = emails.find(e => String(e.id) === req.params.id);
  if (!email) return res.status(404).json({ error: 'Email not found' });
  res.json(email);
});

// 5. Send email
app.post('/api/send', async (req, res) => {
  try {
    const { to, subject, body, from_email } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject and body are required' });
    }
    await transporter.sendMail({
      from: from_email || process.env.EMAIL_USER,
      to,
      subject,
      text: body,
    });
    res.json({ success: true, message: 'Email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Save as draft (IMAP append)
app.post('/api/draft', async (req, res) => {
  try {
    const { to, subject, body, from_email } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject and body are required' });
    }
    const draftFolder = process.env.DRAFT_FOLDER || '[Gmail]/Drafts';
    const from = from_email || process.env.EMAIL_USER;
    const date = new Date().toUTCString();
    // RFC 2822 raw message
    const raw = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    ].join('\r\n');

    await new Promise((resolve, reject) => {
      const imap = createImap();
      const timer = setTimeout(() => {
        imap.destroy();
        reject(new Error('IMAP append timeout'));
      }, 15000);

      imap.once('ready', () => {
        // Correct signature: append(source, message, flags, date, callback)
        imap.append(raw, { mailbox: draftFolder, flags: ['\\Draft', '\\Seen'] }, (err) => {
          clearTimeout(timer);
          imap.end();
          if (err) reject(err); else resolve();
        });
      });
      imap.once('error', (err) => { clearTimeout(timer); reject(err); });
      imap.connect();
    });

    res.json({ success: true, message: `Draft saved to ${draftFolder}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = parseInt(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`MailAssistant running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/emails?limit=20   — fetch & cache emails from IMAP');
  console.log('  GET  /api/emails/cached     — get cached emails');
  console.log('  GET  /api/emails/:id        — get single email');
  console.log('  POST /api/send              — send email');
  console.log('  POST /api/draft             — save draft');
});
