const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { buildBrandProfile, getBrandProfile } = require('../services/profileAnalysisService');
const { prisma } = require('../database');

// Verifica que la cuenta pertenece al usuario autenticado
async function verifyAccountOwnership(accountId, user) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return false;
  if (user.role === 'admin') return true;
  return account.userId === user.id;
}

// GET /api/brand-profile/:accountId — obtener perfil guardado
router.get('/:accountId', requireAuth, asyncHandler(async (req, res) => {
  const accountId = parseInt(req.params.accountId);
  if (isNaN(accountId)) return res.status(400).json({ error: 'ID de cuenta inválido' });

  const owned = await verifyAccountOwnership(accountId, req.user);
  if (!owned) return res.status(403).json({ error: 'Sin acceso a esta cuenta' });

  const profile = await getBrandProfile(accountId);
  res.json({ profile });
}));

// POST /api/brand-profile/:accountId/analyze — analizar y guardar perfil
router.post('/:accountId/analyze', requireAuth, asyncHandler(async (req, res) => {
  const accountId = parseInt(req.params.accountId);
  if (isNaN(accountId)) return res.status(400).json({ error: 'ID de cuenta inválido' });

  const owned = await verifyAccountOwnership(accountId, req.user);
  if (!owned) return res.status(403).json({ error: 'Sin acceso a esta cuenta' });

  const profile = await buildBrandProfile(accountId);
  res.json({ profile, message: 'Perfil de marca analizado exitosamente' });
}));

module.exports = router;
