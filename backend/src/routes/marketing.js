import { Router } from 'express';
import * as marketingService from '../services/marketingService.js';

const router = Router();
function tid(req) { return req.tenant?.id || 'default'; }
function uid(req) { return req.user?.id || 'system'; }

// ── Listings ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const listings = marketingService.listListings(tid(req), req.query);
    res.json({ success: true, data: listings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/analytics', (req, res) => {
  try {
    const analytics = marketingService.listingAnalytics(tid(req));
    res.json({ success: true, data: analytics });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const listing = marketingService.getListing(tid(req), req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    res.json({ success: true, data: listing });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const listing = marketingService.createListing(tid(req), { ...req.body, created_by: uid(req) });
    res.status(201).json({ success: true, data: listing });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const listing = marketingService.updateListing(tid(req), req.params.id, req.body);
    res.json({ success: true, data: listing });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    marketingService.deleteListing(tid(req), req.params.id);
    res.json({ success: true, message: 'تم حذف الإعلان' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.patch('/:id/publish', (req, res) => {
  try {
    const listing = marketingService.publishListing(tid(req), req.params.id);
    res.json({ success: true, data: listing });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.patch('/:id/view', (req, res) => {
  try {
    marketingService.incrementView(tid(req), req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Media ────────────────────────────────────────────────────
router.post('/:id/media', (req, res) => {
  try {
    const media = marketingService.addMedia(tid(req), req.params.id, req.body);
    res.status(201).json({ success: true, data: media });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/:id/media/:mediaId', (req, res) => {
  try {
    marketingService.deleteMedia(tid(req), req.params.id, req.params.mediaId);
    res.json({ success: true, message: 'تم حذف الوسائط' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Inquiries ────────────────────────────────────────────────
router.get('/:id/inquiries', (req, res) => {
  try {
    const inquiries = marketingService.listInquiries(tid(req), req.params.id);
    res.json({ success: true, data: inquiries });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/:id/inquiries', (req, res) => {
  try {
    const inquiry = marketingService.createInquiry(tid(req), { ...req.body, listing_id: req.params.id });
    res.status(201).json({ success: true, data: inquiry });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.patch('/inquiries/:inquiryId/status', (req, res) => {
  try {
    const inquiry = marketingService.updateInquiryStatus(tid(req), req.params.inquiryId, req.body.status, uid(req));
    res.json({ success: true, data: inquiry });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Channels ─────────────────────────────────────────────────
router.get('/channels/all', (req, res) => {
  try {
    const channels = marketingService.listChannels(tid(req));
    if (channels.length === 0) {
      marketingService.seedChannels(tid(req));
      return res.json({ success: true, data: marketingService.listChannels(tid(req)) });
    }
    res.json({ success: true, data: channels });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/channels', (req, res) => {
  try {
    const channel = marketingService.createChannel(tid(req), req.body);
    res.status(201).json({ success: true, data: channel });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;
