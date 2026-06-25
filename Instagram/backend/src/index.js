require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');
const { prisma, seedDatabase } = require('./database');

const postsRouter = require('./routes/posts');
const accountsRouter = require('./routes/accounts');
const aiRouter = require('./routes/ai');
const analyticsRouter = require('./routes/analytics');
const logsRouter = require('./routes/logs');
const authRouter = require('./routes/auth');
const brandProfileRouter = require('./routes/brandProfile');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/brand-profile', brandProfileRouter);

app.use(errorHandler);
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

async function main() {
  // Crear tablas y cargar seed
  await seedDatabase();

  app.listen(PORT, () => {
    console.log(`\n🚀 SocialPilot Backend corriendo en http://localhost:${PORT}`);
    console.log(`📊 Stats API:  http://localhost:${PORT}/api/analytics/stats`);
    console.log(`📝 Posts API:  http://localhost:${PORT}/api/posts`);
    console.log(`🤖 AI API:    http://localhost:${PORT}/api/ai/generate\n`);
  });

  const { initScheduler } = require('./services/schedulerService');
  initScheduler();
}

main().catch(err => {
  console.error('Error iniciando el servidor:', err);
  process.exit(1);
});

module.exports = app;
