// Mulak PropTech — API Layer
// Connects to cloud backend with JWT auth

const ORIGIN = (typeof window !== 'undefined' && window.location.origin !== 'null' && window.location.origin) || 'http://127.0.0.1:3000';
const API_BASE = ORIGIN;
const AUTH_BASE = `${ORIGIN}/api/auth`;

let isOnline = false;
let authToken = localStorage.getItem('mullak_token') || null;
let currentUser = JSON.parse(localStorage.getItem('mullak_user') || 'null');

function setAuth(token, user) {
  authToken = token;
  currentUser = user;
  if (token) localStorage.setItem('mullak_token', token);
  else localStorage.removeItem('mullak_token');
  if (user) localStorage.setItem('mullak_user', JSON.stringify(user));
  else localStorage.removeItem('mullak_user');
}

export function getAuthToken() { return authToken; }
export function getCurrentUser() { return currentUser; }
export function isAuthenticated() { return !!authToken; }

function getHeaders() {
  const token = localStorage.getItem('mullak_token') || authToken;
  if (token !== authToken) authToken = token;
  const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

async function request(method, path, body = null) {
  const opts = { method, headers: getHeaders() };
  if (body) opts.body = JSON.stringify(body);

  try {
    let url;
    if (path.startsWith('/nafath/') || path.startsWith('/otp/')) {
      url = `${API_BASE}/api${path}`;
    } else if (path.startsWith('/api/auth')) {
      url = `${API_BASE}${path}`;
    } else {
      url = `${API_BASE}/api/v1${path}`;
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    isOnline = true;
    return data;
  } catch (e) {
    isOnline = false;
    throw e;
  }
}

// ─── Auth ──────────────────────────────────
export async function register(data) {
  const result = await request('POST', '/api/auth/register', data);
  setAuth(result.token, result.user);
  return result;
}

export async function login(email, password) {
  const result = await request('POST', '/api/auth/login', { email, password });
  setAuth(result.token, result.user);
  return result;
}

export function logout() {
  setAuth(null, null);
  window.location.reload();
}

export async function fetchProfile() {
  return request('GET', '/api/auth/profile');
}

// ─── Finance / P&L ─────────────────────────
export async function fetchProfitLoss(month) {
  const qs = month ? `?month=${month}` : '';
  return request('GET', `/finance/profit-loss${qs}`);
}

export async function fetchYearlyProfitLoss(year) {
  const qs = year ? `?year=${year}` : '';
  return request('GET', `/finance/profit-loss/yearly${qs}`);
}

export async function fetchExpenseCategories() {
  return request('GET', '/finance/expense-categories');
}

// Cached data store
const cache = {
  properties: [],
  units: [],
  contracts: [],
  receipts: [],
  quotations: [],
  employees: [],
  services: [],
  workOrders: [],
};

// ─── Properties ───────────────────────────────
export async function fetchProperties(query = {}) {
  const qs = new URLSearchParams(query).toString();
  const data = await request('GET', `/properties?${qs}`);
  cache.properties = data.data || data || [];
  return cache.properties;
}

export async function fetchProperty(id) {
  return request('GET', `/properties/${id}`);
}

export async function createProperty(data) {
  const result = await request('POST', '/properties', data);
  cache.properties.push(result.property || result);
  return result;
}

export async function updateProperty(id, data) {
  const result = await request('PUT', `/properties/${id}`, data);
  const idx = cache.properties.findIndex(p => p.id === id);
  if (idx >= 0) cache.properties[idx] = result;
  return result;
}

export async function fetchPropertyUnits(propertyId, status) {
  const qs = status ? `?status=${status}` : '';
  const data = await request('GET', `/properties/${propertyId}/units${qs}`);
  return data;
}

export async function fetchPropertyOccupancy(propertyId) {
  return request('GET', `/properties/${propertyId}/occupancy`);
}

export async function fetchDashboardStats() {
  try {
    const data = await request('GET', '/properties/dashboard');
    return data.stats || data;
  } catch {
    return null;
  }
}

// ─── Units ─────────────────────────────────────
export async function fetchUnits(query = {}) {
  const qs = new URLSearchParams(query).toString();
  const data = await request('GET', `/units?${qs}`);
  cache.units = data || [];
  return cache.units;
}

export async function createUnit(data) {
  return request('POST', `/properties/${data.property_id}/units`, data);
}

export async function updateUnit(id, data) {
  return request('PUT', `/units/${id}`, data);
}

// ─── Contracts ─────────────────────────────────
export async function fetchContracts(query = {}) {
  const qs = new URLSearchParams(query).toString();
  const data = await request('GET', `/contracts?${qs}`);
  cache.contracts = data || [];
  return cache.contracts;
}

export async function createContract(data) {
  const result = await request('POST', '/contracts', data);
  cache.contracts.push(result);
  return result;
}

export async function activateContract(id) {
  return request('PUT', `/contracts/${id}/activate`);
}

export async function fetchContractSchedule(contractId) {
  return request('GET', `/contracts/${contractId}/schedule`);
}

export async function fetchExpiringContracts() {
  return request('GET', '/contracts/expiring');
}

export async function fetchOverduePayments() {
  return request('GET', '/contracts/overdue');
}

export async function updateIjarStatus(contractId, data) {
  return request('PUT', `/contracts/${contractId}/ijar`, data);
}

export async function updateNajizStatus(contractId, data) {
  return request('PUT', `/contracts/${contractId}/najiz`, data);
}

// ─── Receipts ──────────────────────────────────
export async function fetchReceipts(query = {}) {
  const qs = new URLSearchParams(query).toString();
  const data = await request('GET', `/receipts?${qs}`);
  cache.receipts = data || [];
  return cache.receipts;
}

export async function createReceipt(data) {
  return request('POST', '/receipts', data);
}

// ─── Quotations ────────────────────────────────
export async function fetchQuotations() {
  const data = await request('GET', '/quotations');
  cache.quotations = data || [];
  return cache.quotations;
}

export async function createQuotation(data) {
  return request('POST', '/quotations', data);
}

export async function acceptQuotation(id) {
  return request('PUT', `/quotations/${id}/accept`);
}

// ─── Employees & Payroll ──────────────────────
export async function fetchEmployees() {
  const data = await request('GET', '/employees');
  cache.employees = data || [];
  return cache.employees;
}

export async function createEmployee(data) {
  return request('POST', '/employees', data);
}

export async function runPayroll(month) {
  return request('POST', '/employees/payroll', { month });
}

// ─── Operations ────────────────────────────────
export async function fetchServiceContracts() {
  const data = await request('GET', '/operations/service-contracts');
  cache.services = data || [];
  return cache.services;
}

export async function createServiceContract(data) {
  return request('POST', '/operations/service-contracts', data);
}

export async function fetchWorkOrders() {
  const data = await request('GET', '/operations/work-orders');
  cache.workOrders = data || [];
  return cache.workOrders;
}

export async function createWorkOrder(data) {
  return request('POST', '/operations/work-orders', data);
}

export async function generateDueReceipts() {
  try {
    return await request('POST', '/receipts/generate-due');
  } catch {
    return { generated: 0 };
  }
}

// ─── Status ────────────────────────────────────
export async function checkBackendStatus() {
  try {
    const res = await fetch(`${ORIGIN}/api/status`, { headers: getHeaders() });
    const data = await res.json();
    isOnline = true;
    return data;
  } catch {
    isOnline = false;
    return null;
  }
}

export function getOnlineStatus() {
  return isOnline;
}

export function getCache() {
  return cache;
}

// ─── Customers ───────────────────────────────
export async function fetchCustomers(query = {}) {
  const qs = new URLSearchParams(query).toString();
  return request('GET', `/customers?${qs}`);
}

export async function createCustomer(data) {
  return request('POST', '/customers', data);
}

export async function updateCustomer(id, data) {
  return request('PUT', `/customers/${id}`, data);
}

export async function deleteCustomer(id) {
  return request('DELETE', `/customers/${id}`);
}

// ─── Utilities ─────────────────────────────
export async function fetchBillByMeter(unitId, utilityType) {
  return request('POST', '/utilities/fetch-by-meter', { unit_id: unitId, utility_type: utilityType });
}

// ─── VAT Cycle ─────────────────────────────
export async function fetchVatCycle() {
  return request('GET', '/finance/vat-cycle');
}

export async function updateVatCycle(cycle) {
  return request('PUT', '/finance/vat-cycle', { cycle });
}

// ─── Nafath Integration ────────────────────
export async function nafathVerify(nationalId, phone) {
  return request('POST', '/nafath/verify', { national_id: nationalId, phone });
}

export async function nafathCheckStatus(requestId) {
  return request('GET', `/nafath/status/${requestId}`);
}

// ─── OTP Verification ─────────────────────
export async function otpSend(target, channel = 'sms', purpose = 'generic') {
  return request('POST', '/otp/send', { target, channel, purpose });
}

export async function otpConfirm(challengeId, otp) {
  return request('POST', '/otp/confirm', { challenge_id: challengeId, otp });
}

export async function otpStatus(challengeId) {
  return request('GET', `/otp/status/${challengeId}`);
}

// ─── Fal Marketing Contracts ──────────────
export async function fetchFalContracts(query = {}) {
  const qs = new URLSearchParams(query).toString();
  return request('GET', `/fal?${qs}`);
}

export async function createFalContract(data) {
  return request('POST', '/fal', data);
}

export async function updateFalContract(id, data) {
  return request('PUT', `/fal/${id}`, data);
}

export async function activateFalContract(id) {
  return request('PUT', `/fal/${id}/activate`);
}

export async function cancelFalContract(id, reason) {
  return request('PUT', `/fal/${id}/cancel`, { reason });
}

export async function completeFalContract(id) {
  return request('PUT', `/fal/${id}/complete`);
}

export async function submitFalToPlatform(id) {
  return request('POST', `/fal/${id}/submit-to-fal`);
}

export async function checkFalPlatformStatus(id) {
  return request('GET', `/fal/${id}/fal-status`);
}
