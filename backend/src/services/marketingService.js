import { getDb } from '../db/database.js';
import { generateId } from './helpers.js';

const listingFields = `id, tenant_id, listing_number, property_id, unit_id, listing_type,
  title_ar, title_en, description_ar, description_en, price, price_negotiable,
  currency, status, featured, channels, media_count, view_count, inquiry_count,
  published_at, expires_at, created_at, updated_at`;

export function listListings(tenantId, filters = {}) {
  const db = getDb();
  let query = `SELECT l.*, p.name_ar AS property_name, u.unit_number
    FROM marketing_listings l
    LEFT JOIN properties p ON p.id = l.property_id
    LEFT JOIN units u ON u.id = l.unit_id
    WHERE l.tenant_id = ?`;
  const params = [tenantId];
  if (filters.status) { query += ` AND l.status = ?`; params.push(filters.status); }
  if (filters.listing_type) { query += ` AND l.listing_type = ?`; params.push(filters.listing_type); }
  if (filters.featured) { query += ` AND l.featured = 1`; }
  query += ` ORDER BY l.created_at DESC LIMIT 200`;
  return db.prepare(query).all(...params);
}

export function getListing(tenantId, id) {
  const db = getDb();
  const listing = db.prepare(`
    SELECT l.*, p.name_ar AS property_name, p.name_en AS property_name_en,
      u.unit_number
    FROM marketing_listings l
    LEFT JOIN properties p ON p.id = l.property_id
    LEFT JOIN units u ON u.id = l.unit_id
    LEFT JOIN users cr ON cr.id = l.created_by
    WHERE l.id = ? AND l.tenant_id = ?
  `).get(id, tenantId);
  if (!listing) return null;
  const media = db.prepare(`SELECT * FROM marketing_media WHERE listing_id = ? ORDER BY sort_order`).all(id);
  const inquiries = db.prepare(`
    SELECT mi.*, u.full_name_ar AS assigned_name
    FROM marketing_inquiries mi LEFT JOIN users u ON u.id = mi.assigned_to
    WHERE mi.listing_id = ? ORDER BY mi.created_at DESC
  `).all(id);
  return { ...listing, media, inquiries };
}

export function createListing(tenantId, data) {
  const db = getDb();
  const id = generateId();
  const listingNo = `LST-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO marketing_listings (id, tenant_id, listing_number, property_id, unit_id,
      listing_type, title_ar, title_en, description_ar, description_en,
      price, price_negotiable, currency, status, featured, channels, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, listingNo,
    data.property_id || null, data.unit_id || null,
    data.listing_type || 'rent', data.title_ar, data.title_en || '',
    data.description_ar || '', data.description_en || '',
    data.price || 0, data.price_negotiable ? 1 : 0, data.currency || 'SAR',
    data.status || 'draft', data.featured ? 1 : 0,
    JSON.stringify(data.channels || []), data.created_by || 'system');
  return getListing(tenantId, id);
}

export function updateListing(tenantId, id, data) {
  const db = getDb();
  const existing = getListing(tenantId, id);
  if (!existing) throw new Error('الإعلان غير موجود');
  db.prepare(`
    UPDATE marketing_listings SET
      property_id=?, unit_id=?, listing_type=?, title_ar=?, title_en=?,
      description_ar=?, description_en=?, price=?, price_negotiable=?,
      currency=?, status=?, featured=?, channels=?, expires_at=?,
      updated_at=datetime('now')
    WHERE id=? AND tenant_id=?
  `).run(
    data.property_id || existing.property_id, data.unit_id || existing.unit_id,
    data.listing_type || existing.listing_type,
    data.title_ar !== undefined ? data.title_ar : existing.title_ar,
    data.title_en !== undefined ? data.title_en : existing.title_en,
    data.description_ar !== undefined ? data.description_ar : existing.description_ar,
    data.description_en !== undefined ? data.description_en : existing.description_en,
    data.price || existing.price,
    data.price_negotiable !== undefined ? (data.price_negotiable ? 1 : 0) : existing.price_negotiable,
    data.currency || existing.currency, data.status || existing.status,
    data.featured !== undefined ? (data.featured ? 1 : 0) : existing.featured,
    data.channels ? JSON.stringify(data.channels) : existing.channels,
    data.expires_at || existing.expires_at, id, tenantId);
  return getListing(tenantId, id);
}

export function deleteListing(tenantId, id) {
  const db = getDb();
  db.prepare(`DELETE FROM marketing_listings WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { deleted: true };
}

export function publishListing(tenantId, id) {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM marketing_listings WHERE id=? AND tenant_id=?`).get(id, tenantId);
  if (!existing) throw new Error('الإعلان غير موجود');
  const now = new Date().toISOString().split('T')[0];
  const expire = new Date();
  expire.setDate(expire.getDate() + 90);
  db.prepare(`UPDATE marketing_listings SET status='published', published_at=COALESCE(published_at, ?), expires_at=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(now, expire.toISOString().split('T')[0], id, tenantId);
  return getListing(tenantId, id);
}

export function addMedia(tenantId, listingId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`INSERT INTO marketing_media (id, tenant_id, listing_id, media_type, url, thumb_url, alt_text, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenantId, listingId, data.media_type || 'image', data.url, data.thumb_url || '', data.alt_text || '', data.sort_order || 0);
  db.prepare(`UPDATE marketing_listings SET media_count = (SELECT COUNT(*) FROM marketing_media WHERE listing_id=?) WHERE id=?`)
    .run(listingId, listingId);
  return db.prepare(`SELECT * FROM marketing_media WHERE id = ?`).get(id);
}

export function deleteMedia(tenantId, listingId, mediaId) {
  const db = getDb();
  db.prepare(`DELETE FROM marketing_media WHERE id=? AND listing_id=? AND tenant_id=?`).run(mediaId, listingId, tenantId);
  db.prepare(`UPDATE marketing_listings SET media_count = (SELECT COUNT(*) FROM marketing_media WHERE listing_id=?) WHERE id=?`)
    .run(listingId, listingId);
  return { deleted: true };
}

export function incrementView(tenantId, id) {
  const db = getDb();
  db.prepare(`UPDATE marketing_listings SET view_count = view_count + 1 WHERE id=? AND tenant_id=?`).run(id, tenantId);
  return { success: true };
}

export function listInquiries(tenantId, listingId) {
  const db = getDb();
  return db.prepare(`
    SELECT mi.*, u.full_name_ar AS assigned_name
    FROM marketing_inquiries mi LEFT JOIN users u ON u.id = mi.assigned_to
    WHERE mi.listing_id = ? AND mi.tenant_id = ? ORDER BY mi.created_at DESC
  `).all(listingId, tenantId);
}

export function createInquiry(tenantId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`INSERT INTO marketing_inquiries (id, tenant_id, listing_id, inquirer_name, inquirer_phone, inquirer_email, message, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenantId, data.listing_id, data.inquirer_name, data.inquirer_phone || '',
      data.inquirer_email || '', data.message || '', data.assigned_to || null);
  db.prepare(`UPDATE marketing_listings SET inquiry_count = (SELECT COUNT(*) FROM marketing_inquiries WHERE listing_id=?) WHERE id=?`)
    .run(data.listing_id, data.listing_id);
  return db.prepare(`SELECT * FROM marketing_inquiries WHERE id = ?`).get(id);
}

export function updateInquiryStatus(tenantId, id, status, userId) {
  const db = getDb();
  const validStatuses = ['new','contacted','qualified','converted','closed'];
  if (!validStatuses.includes(status)) throw new Error('حالة غير صالحة');
  db.prepare(`UPDATE marketing_inquiries SET status=?, assigned_to=COALESCE(?, assigned_to), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(status, userId || null, id, tenantId);
  return db.prepare(`SELECT * FROM marketing_inquiries WHERE id = ?`).get(id);
}

export function listChannels(tenantId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM marketing_channels WHERE tenant_id = ? ORDER BY name_ar`).all(tenantId);
}

export function createChannel(tenantId, data) {
  const db = getDb();
  const id = generateId();
  db.prepare(`INSERT INTO marketing_channels (id, tenant_id, name_ar, name_en, channel_type) VALUES (?, ?, ?, ?, ?)`)
    .run(id, tenantId, data.name_ar, data.name_en || '', data.channel_type || 'website');
  return db.prepare(`SELECT * FROM marketing_channels WHERE id = ?`).get(id);
}

export function seedChannels(tenantId) {
  const db = getDb();
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM marketing_channels WHERE tenant_id = ?`).get(tenantId);
  if (existing.c > 0) return;
  const channels = [
    { name_ar: 'الموقع الإلكتروني', name_en: 'Website', channel_type: 'website' },
    { name_ar: 'تويتر', name_en: 'Twitter/X', channel_type: 'social' },
    { name_ar: 'انستقرام', name_en: 'Instagram', channel_type: 'social' },
    { name_ar: 'عقار', name_en: 'Aqar', channel_type: 'portal' },
    { name_ar: 'حراج', name_en: 'Haraj', channel_type: 'portal' },
    { name_ar: 'تطبيق ملاك', name_en: 'Mulak App', channel_type: 'website' },
  ];
  const stmt = db.prepare(`INSERT INTO marketing_channels (id, tenant_id, name_ar, name_en, channel_type) VALUES (?, ?, ?, ?, ?)`);
  for (const ch of channels) stmt.run(generateId(), tenantId, ch.name_ar, ch.name_en, ch.channel_type);
}

export function listingAnalytics(tenantId) {
  const db = getDb();
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM marketing_listings WHERE tenant_id = ? GROUP BY status`).all(tenantId);
  const byType = db.prepare(`SELECT listing_type, COUNT(*) AS count FROM marketing_listings WHERE tenant_id = ? GROUP BY listing_type`).all(tenantId);
  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const published = byStatus.find(r => r.status === 'published')?.count || 0;
  const views = db.prepare(`SELECT COALESCE(SUM(view_count),0) AS v, COALESCE(SUM(inquiry_count),0) AS i FROM marketing_listings WHERE tenant_id = ?`).get(tenantId);
  return { byStatus, byType, total, published, total_views: views.v, total_inquiries: views.i };
}
