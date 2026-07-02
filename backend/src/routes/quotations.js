import { Router } from 'express';
import { QuotationService } from '../services/quotationService.js';

const router = Router();
const quotationService = new QuotationService();

router.post('/', (req, res) => {
  const quote = quotationService.create(req.tenant, req.body);
  res.status(201).json(quote);
});

router.get('/', (req, res) => {
  const quotes = quotationService.findAll(req.tenant.tenantId);
  res.json(quotes);
});

router.put('/:id/accept', (req, res) => {
  const quote = quotationService.acceptConvert(req.tenant, req.params.id);
  res.json(quote);
});

export default router;
