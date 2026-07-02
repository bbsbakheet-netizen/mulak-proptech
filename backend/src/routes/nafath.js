import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

router.post('/verify', (req, res) => {
  const { national_id, phone } = req.body;
  if (!national_id || !phone) {
    return res.status(400).json({ error: true, message: 'رقم الهوية والجوال مطلوبان' });
  }

  const requestId = `NAF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 120000).toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO nafath_challenges (id, national_id, phone, otp_code, status, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(requestId, national_id, phone, otpCode, expiresAt);

  console.log(`[Nafath] Verification requested for ${national_id}, OTP: ${otpCode}`);

  res.json({
    request_id: requestId,
    status: 'pending',
    message: 'تم إرسال رمز التحقق إلى جوالك المسجل في منصة نفاذ',
    expires_in: 120,
  });
});

router.post('/confirm', (req, res) => {
  const { request_id, otp } = req.body;
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM nafath_challenges WHERE id = ?').get(request_id);
  if (!challenge) return res.status(404).json({ error: true, message: 'طلب تحقق غير صالح' });
  if (challenge.status === 'verified') return res.json({ status: 'verified', message: 'تم التحقق مسبقاً' });
  if (new Date(challenge.expires_at) < new Date()) return res.status(410).json({ error: true, message: 'انتهت صلاحية رمز التحقق' });
  if (challenge.otp_code !== otp) return res.status(401).json({ error: true, message: 'رمز التحقق غير صحيح' });

  db.prepare("UPDATE nafath_challenges SET status = 'verified', verified_at = ? WHERE id = ?")
    .run(new Date().toISOString(), request_id);

  res.json({
    status: 'verified',
    national_id: challenge.national_id,
    message: 'تم التحقق من الهوية بنجاح عبر منصة نفاذ',
    verified_at: new Date().toISOString(),
  });
});

router.get('/status/:requestId', (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM nafath_challenges WHERE id = ?').get(req.params.requestId);
  if (!challenge) return res.status(404).json({ error: true, message: 'طلب غير موجود' });
  res.json({
    request_id: req.params.requestId,
    status: challenge.status,
    national_id: challenge.status === 'verified' ? challenge.national_id : undefined,
    verified_at: challenge.verified_at || null,
  });
});

export default router;