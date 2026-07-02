import { Router } from 'express';
import { AuthService } from '../services/authService.js';

const router = Router();
const service = new AuthService();

router.post('/register', (req, res) => {
  try {
    const result = service.register(req.body);
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: true, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }
    const result = service.login(email, password);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.post('/forgot-password', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: true, message: 'رقم الجوال مطلوب' });
    const result = service.forgotPassword(phone);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.post('/reset-password', (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    if (!reset_token || !new_password) return res.status(400).json({ error: true, message: 'رمز إعادة التعيين وكلمة المرور الجديدة مطلوبان' });
    const result = service.resetPassword(reset_token, new_password);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: true, message: e.message });
  }
});

router.get('/profile', (req, res) => {
  const profile = service.getProfile(req.tenant.userId, req.tenant.tenantId);
  if (!profile) return res.status(404).json({ error: true, message: 'User not found' });
  res.json(profile);
});

export default router;
