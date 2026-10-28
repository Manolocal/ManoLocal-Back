require('dotenv').config();
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
  },
});

async function verify() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, role: true },
  });

  if (!admin) {
    console.error('No admin found in database!');
    return;
  }

  const token = jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const skills = ['Plomería', 'Electricidad', 'Cerrajería', 'Tablaroca', 'Pintura'];
  
  for (const skill of skills) {
    const url = `http://localhost:3000/search/specialists?skill=${encodeURIComponent(skill)}&postalCode=37600`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    const payload = json.data || json;
    console.log(`\n========================================`);
    console.log(`BÚSQUEDA: "${skill}" en CP 37600 (Municipio: ${payload.geoFilter?.municipio})`);
    console.log(`Especialistas encontrados: ${payload.specialists?.length || 0}`);
    console.log(`Total CPs en municipio: ${payload.geoFilter?.totalPostalCodesInMunicipality}`);
    if (payload.specialists) {
      payload.specialists.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.profile?.fullName || s.name} (${s.profile?.postalCode}) - Tel: ${s.profile?.phone}`);
        const skillsList = s.knowledges.map(k => {
          const verif = k.verifications?.[0];
          return verif ? `${k.name} [✓ Certificado IA ${verif.score}%]` : k.name;
        }).join(', ');
        console.log(`     Habilidades: ${skillsList}`);
      });
    }
  }
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
