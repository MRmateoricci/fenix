const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

async function seedDatabase() {
  // Crear admin si no existe
  const adminExists = await prisma.user.findUnique({ where: { email: 'admin@socialpilot.ai' } });
  if (!adminExists) {
    const hashed = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: { email: 'admin@socialpilot.ai', name: 'Administrador', password: hashed, role: 'admin' }
    });
    console.log('👤 Admin creado: admin@socialpilot.ai / admin123');
  }

  // Seed de cuentas y posts de ejemplo (solo si no hay cuentas)
  const count = await prisma.account.count();
  if (count > 0) return;

  console.log('🌱 Cargando datos de ejemplo...');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@socialpilot.ai' } });

  const accounts = await Promise.all([
    prisma.account.create({ data: { userId: admin.id, name: 'Mi Marca Personal', platform: 'instagram', username: '@mi_marca_personal', status: 'connected', avatarColor: '#6366f1', followers: 12400 } }),
    prisma.account.create({ data: { userId: admin.id, name: 'Mi Marca FB', platform: 'facebook', username: 'Mi Marca Personal', status: 'connected', avatarColor: '#3b82f6', followers: 8200 } }),
    prisma.account.create({ data: { userId: admin.id, name: 'Cliente Fitness', platform: 'instagram', username: '@fitness_pro_ar', status: 'connected', avatarColor: '#10b981', followers: 45000 } }),
    prisma.account.create({ data: { userId: admin.id, name: 'Cliente Restaurant', platform: 'instagram', username: '@la_buena_mesa', status: 'disconnected', avatarColor: '#f59e0b', followers: 3100 } }),
  ]);

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const tomorrow = new Date(now.getTime() + 86400000);
  const in2days = new Date(now.getTime() + 172800000);
  const in3days = new Date(now.getTime() + 259200000);

  const posts = await Promise.all([
    prisma.post.create({ data: { accountId: accounts[0].id, platforms: '["instagram"]', imageUrl: 'https://picsum.photos/seed/post1/800/800', caption: '✨ El éxito no es un destino, es un viaje. Cada día es una nueva oportunidad para crecer y mejorar.', hashtags: '["motivacion","exito","crecimientopersonal","mentalidadganadora","argentina"]', scheduledAt: yesterday, publishedAt: yesterday, status: 'published', tone: 'inspiracional', niche: 'lifestyle' } }),
    prisma.post.create({ data: { accountId: accounts[2].id, platforms: '["instagram"]', imageUrl: 'https://picsum.photos/seed/post2/800/800', caption: '💪 ¿Ya hiciste tu entrenamiento de hoy? Recuerda: la consistencia es la clave del progreso.', hashtags: '["fitness","gym","entrenamiento","salud","workout","fitnessmotivation"]', scheduledAt: yesterday, publishedAt: yesterday, status: 'published', tone: 'motivacional', niche: 'fitness' } }),
    prisma.post.create({ data: { accountId: accounts[1].id, platforms: '["facebook"]', imageUrl: 'https://picsum.photos/seed/post3/800/800', caption: 'Nuevo día, nuevas oportunidades. ¡Compartinos qué meta te pusiste para hoy! 👇', hashtags: '["buendia","motivacion","comunidad"]', scheduledAt: yesterday, publishedAt: yesterday, status: 'published', tone: 'casual', niche: 'lifestyle' } }),
    prisma.post.create({ data: { accountId: accounts[0].id, platforms: '["instagram","facebook"]', imageUrl: 'https://picsum.photos/seed/post4/800/800', caption: '🌅 Buenos días! Comenzá la semana con energía positiva y mucha determinación.', hashtags: '["lunesdemotivacion","semananueva","positividad","argentina","buenasemana"]', scheduledAt: tomorrow, status: 'scheduled', tone: 'inspiracional', niche: 'lifestyle' } }),
    prisma.post.create({ data: { accountId: accounts[2].id, platforms: '["instagram"]', imageUrl: 'https://picsum.photos/seed/post5/800/800', caption: '🥗 Nutrición + ejercicio = resultados reales. Te compartimos nuestro plan de comidas de la semana.', hashtags: '["nutricion","fitness","alimentacionsaludable","dieta","saludable"]', scheduledAt: in2days, status: 'scheduled', tone: 'educativo', niche: 'fitness' } }),
    prisma.post.create({ data: { accountId: accounts[3].id, platforms: '["instagram","facebook"]', imageUrl: 'https://picsum.photos/seed/post6/800/800', caption: '🍝 Este miércoles especial de pasta casera te va a dejar sin palabras. Reservas limitadas!', hashtags: '["gastronomia","pasta","restaurante","buenosaires","foodie","casero"]', scheduledAt: in3days, status: 'scheduled', tone: 'casual', niche: 'gastronomia' } }),
    prisma.post.create({ data: { accountId: accounts[0].id, platforms: '["instagram"]', imageUrl: 'https://picsum.photos/seed/post7/800/800', caption: 'Borrador en proceso de edición...', hashtags: '[]', status: 'draft', tone: 'casual', niche: 'lifestyle' } }),
    prisma.post.create({ data: { accountId: accounts[3].id, platforms: '["instagram"]', imageUrl: 'https://picsum.photos/seed/post8/800/800', caption: 'Promoción especial del fin de semana!', hashtags: '["promo","descuento"]', scheduledAt: yesterday, status: 'failed', tone: 'casual', niche: 'gastronomia', errorMessage: 'Error de autenticación: token de Meta expirado' } }),
  ]);

  await Promise.all([
    prisma.postLog.create({ data: { postId: posts[0].id, action: 'PUBLISHED', message: 'Publicación enviada exitosamente a Instagram', level: 'success' } }),
    prisma.postLog.create({ data: { postId: posts[1].id, action: 'PUBLISHED', message: 'Publicación enviada exitosamente a Instagram', level: 'success' } }),
    prisma.postLog.create({ data: { postId: posts[2].id, action: 'PUBLISHED', message: 'Publicación enviada exitosamente a Facebook', level: 'success' } }),
    prisma.postLog.create({ data: { postId: posts[3].id, action: 'SCHEDULED', message: 'Publicación programada para mañana', level: 'info' } }),
    prisma.postLog.create({ data: { postId: posts[4].id, action: 'SCHEDULED', message: 'Publicación programada con horario óptimo', level: 'info' } }),
    prisma.postLog.create({ data: { postId: posts[7].id, action: 'FAILED', message: 'Error de autenticación: token de Meta expirado', level: 'error' } }),
    prisma.postLog.create({ data: { postId: posts[7].id, action: 'RETRY', message: 'Reintento 1/3 fallido', level: 'warning' } }),
  ]);

  console.log('✅ Datos de ejemplo cargados correctamente');
}

module.exports = { prisma, seedDatabase };
