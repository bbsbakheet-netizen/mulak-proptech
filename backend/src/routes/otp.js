import { Router } from 'express';
import { getDb } from '../db/database.js';
import { generateId } from '../services/helpers.js';

const router = Router();

router.post('/send', (req, res) => {
  try {
    const { target, channel, purpose } = req.body;
    if (!target) {
      return res.status(400).json({ error: true, message: 'البريد الإلكتروني أو رقم الجوال مطلوب' });
    }

    const ch = channel || 'sms';
    const purp = purpose || 'generic';
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const id = generateId();
    const expiresAt = new Date(Date.now() + 300000).toISOString();

    const db = getDb();
    db.prepare(`
      INSERT INTO otp_challenges (id, target, channel, purpose, otp_code, status, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, target, ch, purp, otpCode, expiresAt);

    const masked = ch === 'email'
      ? target.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
      : target.replace(/(\d{3})\d{4}(\d{2})$/, '$1****$2');

    console.log(`[OTP] Sent to ${ch}:${masked} | Code: ${otpCode} | Purpose: ${purp} | Exp: ${expiresAt}`);

    res.json({
      challenge_id: id,
      target: masked,
      channel: ch,
      purpose: purp,
      message: ch === 'email'
        ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
        : 'تم إرسال رمز التحقق إلى جوالك',
      expires_in: 300,
    });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.post('/confirm', (req, res) => {
  try {
    const { challenge_id, otp } = req.body;
    if (!challenge_id || !otp) {
      return res.status(400).json({ error: true, message: 'معرّف التحدي ورمز التحقق مطلوبان' });
    }

    const db = getDb();
    const challenge = db.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(challenge_id);
    if (!challenge) {
      return res.status(404).json({ error: true, message: 'طلب تحقق غير صالح' });
    }
    if (challenge.status === 'verified') {
      return res.json({ status: 'verified', message: 'تم التحقق مسبقاً' });
    }
    if (new Date(challenge.expires_at) < new Date()) {
      return res.status(410).json({ error: true, message: 'انتهت صلاحية رمز التحقق' });
    }
    if (challenge.otp_code !== otp) {
      return res.status(401).json({ error: true, message: 'رمز التحقق غير صحيح' });
    }

    db.prepare("UPDATE otp_challenges SET status = 'verified', verified_at = ? WHERE id = ?")
      .run(new Date().toISOString(), challenge_id);

    res.json({
      status: 'verified',
      target: challenge.target,
      purpose: challenge.purpose,
      message: 'تم التحقق بنجاح',
      verified_at: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

router.get('/status/:challengeId', (req, res) => {
  try {
    const db = getDb();
    const challenge = db.prepare('SELECT * FROM otp_challenges WHERE id = ?').get(req.params.challengeId);
    if (!challenge) {
      return res.status(404).json({ error: true, message: 'طلب غير موجود' });
    }
    res.json({
      challenge_id: challenge.id,
      status: challenge.status,
      target: challenge.status === 'verified' ? challenge.target : undefined,
      channel: challenge.channel,
      purpose: challenge.purpose,
      verified_at: challenge.verified_at || null,
      expires_at: challenge.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: true, message: e.message });
  }
});

export default router;
