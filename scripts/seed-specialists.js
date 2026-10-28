require('dotenv').config();
const { PrismaClient, Role, UserStatus, DocumentVerificationStatus } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

const SPECIALISTS_DATA = [
  {
    name: 'Mateo Hernández Cruz',
    email: 'mateo.plomero@manolocal.com',
    phone: '4281012345',
    address: 'Calle Hidalgo 124, Col. Centro',
    postalCode: '37600',
    skills: [
      { name: 'Plomería', certified: true, score: 96, reason: 'Certificado de fontanería y redes hidráulicas validado por IA' },
      { name: 'Instalaciones de Gas', certified: true, score: 92, reason: 'Diploma técnico en instalaciones de gas LP validado' },
      { name: 'Climatización y Aire Acondicionado', certified: false },
      { name: 'Reparación de Boiler', certified: true, score: 88, reason: 'Acreditación técnica en calentadores solares y de gas' },
    ],
  },
  {
    name: 'Javier Gómez Valadez',
    email: 'javier.electricista@manolocal.com',
    phone: '4281023456',
    address: 'Av. Colón 45, Fracc. Jardines de San Antonio',
    postalCode: '37600',
    skills: [
      { name: 'Electricidad', certified: true, score: 98, reason: 'Cédula de técnico electricista industrial validada' },
      { name: 'Iluminación LED', certified: false },
      { name: 'Climatización y Aire Acondicionado', certified: true, score: 90, reason: 'Certificación HVAC en minisplits residenciales' },
      { name: 'Sistemas de Seguridad y Cámaras', certified: false },
    ],
  },
  {
    name: 'Sofía Ramírez Torres',
    email: 'sofia.carpinteria@manolocal.com',
    phone: '4281034567',
    address: 'Calle Morelos 89, Col. Coecillo',
    postalCode: '37605',
    skills: [
      { name: 'Carpintería', certified: true, score: 95, reason: 'Diploma en ebanistería fina y diseño de muebles' },
      { name: 'Barnizado y Restauración de Muebles', certified: false },
      { name: 'Cerrajería', certified: true, score: 87, reason: 'Acreditación en cerrajería residencial y chapa digital' },
    ],
  },
  {
    name: 'Alejandro Morales Ibarra',
    email: 'alejandro.herreria@manolocal.com',
    phone: '4281045678',
    address: 'Carretera San Felipe km 2, Trojes de Aguirre',
    postalCode: '37603',
    skills: [
      { name: 'Herrería', certified: true, score: 94, reason: 'Certificado en estructuras metálicas y forja tradicional' },
      { name: 'Soldadura Especializada', certified: true, score: 97, reason: 'Certificación internacional en soldadura MIG/TIG' },
      { name: 'Cerrajería', certified: false },
      { name: 'Portones Automáticos', certified: false },
    ],
  },
  {
    name: 'Daniela Ortiz Méndez',
    email: 'daniela.pintura@manolocal.com',
    phone: '4281056789',
    address: 'Calle 5 de Mayo 210, Col. Esquípulas',
    postalCode: '37600',
    skills: [
      { name: 'Pintura', certified: true, score: 93, reason: 'Certificación Comex en técnicas decorativas y acabados' },
      { name: 'Tablaroca', certified: false },
      { name: 'Impermeabilización', certified: true, score: 91, reason: 'Acreditación en sistemas impermeables prefabricados' },
      { name: 'Acabados y Yeso', certified: false },
    ],
  },
  {
    name: 'Roberto Vargas Castillo',
    email: 'roberto.construccion@manolocal.com',
    phone: '4281067890',
    address: 'Av. Juárez 312, Rancho Nuevo del Salto',
    postalCode: '37604',
    skills: [
      { name: 'Albañilería', certified: true, score: 95, reason: 'Certificación laboral CONOCER en edificación de obra' },
      { name: 'Colocación de Pisos y Azulejos', certified: false },
      { name: 'Impermeabilización', certified: false },
      { name: 'Plomería', certified: true, score: 89, reason: 'Curso técnico en redes de drenaje y agua potable' },
    ],
  },
  {
    name: 'Eduardo Navarro Luna',
    email: 'eduardo.climas@manolocal.com',
    phone: '4281078901',
    address: 'Calle Zaragoza 54, Col. Los Espinos',
    postalCode: '37600',
    skills: [
      { name: 'Electricidad', certified: true, score: 92, reason: 'Certificado de instalador en baja tensión' },
      { name: 'Plomería', certified: false },
      { name: 'Instalaciones de Gas', certified: true, score: 94, reason: 'Acreditación oficial de la Secretaría de Energía' },
    ],
  },
  {
    name: 'Mariana Rivas Delgado',
    email: 'mariana.cerrajeria@manolocal.com',
    phone: '4281089012',
    address: 'Calle Allende 77, Providencia de Guadalupe',
    postalCode: '37610',
    skills: [
      { name: 'Cerrajería', certified: true, score: 96, reason: 'Certificación en cerrajería automotriz y bancaria' },
      { name: 'Portones Automáticos', certified: true, score: 90, reason: 'Diploma en motores Merik y Liftmaster' },
      { name: 'Sistemas de Seguridad y Cámaras', certified: false },
    ],
  },
  {
    name: 'Guillermo Silva Pacheco',
    email: 'guillermo.reformas@manolocal.com',
    phone: '4281090123',
    address: 'Camino Real 18, Cerrito de los Hernández',
    postalCode: '37606',
    skills: [
      { name: 'Tablaroca', certified: true, score: 93, reason: 'Diploma USG en muros divisorios y plafones' },
      { name: 'Pintura', certified: false },
      { name: 'Carpintería', certified: false },
      { name: 'Colocación de Pisos y Azulejos', certified: true, score: 95, reason: 'Certificado Interceramic en pisos porcelánicos' },
    ],
  },
  {
    name: 'Fernando Castro Benítez',
    email: 'fernando.mantenimiento@manolocal.com',
    phone: '4281101234',
    address: 'Calle Libertad 15, La Tapona',
    postalCode: '37620',
    skills: [
      { name: 'Electricidad', certified: false },
      { name: 'Albañilería', certified: true, score: 90, reason: 'Constancia técnica en cimentación y acabados' },
      { name: 'Herrería', certified: false },
      { name: 'Reparación de Boiler', certified: true, score: 94, reason: 'Acreditación técnica en sistemas de calentamiento de agua' },
    ],
  },
];

async function seed() {
  console.log('--- Iniciando siembra de 10 Especialistas en la zona de San Felipe (CP ~37600) ---');

  const hashedPassword = await bcrypt.hash('Password123!', 10);
  let count = 0;

  for (const spec of SPECIALISTS_DATA) {
    // 1. Upsert User
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        email: spec.email,
        name: spec.name,
        password: hashedPassword,
        role: Role.ESPECIALISTA,
        status: UserStatus.ACTIVO,
      },
      update: {
        name: spec.name,
        role: Role.ESPECIALISTA,
        status: UserStatus.ACTIVO,
      },
    });

    // 2. Upsert Profile con KYC simulado completo
    const ineUrl = `https://xoonfxugqbvplgfxgcyc.supabase.co/storage/v1/object/public/kyc/kyc/${user.id}/ine/ine-${spec.postalCode}.jpg`;
    const selfieUrl = `https://xoonfxugqbvplgfxgcyc.supabase.co/storage/v1/object/public/kyc/kyc/${user.id}/selfie/selfie-${spec.postalCode}.jpg`;

    await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName: spec.name,
        phone: spec.phone,
        address: spec.address,
        postalCode: spec.postalCode,
        ineUrl,
        selfieUrl,
      },
      update: {
        fullName: spec.name,
        phone: spec.phone,
        address: spec.address,
        postalCode: spec.postalCode,
        ineUrl,
        selfieUrl,
      },
    });

    // 3. Limpiar y recrear conocimientos para no duplicar en re-ejecuciones
    await prisma.knowledge.deleteMany({ where: { userId: user.id } });

    for (const skill of spec.skills) {
      const knowledge = await prisma.knowledge.create({
        data: {
          userId: user.id,
          name: skill.name,
        },
      });

      // Si tiene certificación validada por IA, registrar DocumentVerification
      if (skill.certified) {
        await prisma.documentVerification.create({
          data: {
            knowledgeId: knowledge.id,
            fileUrl: `https://xoonfxugqbvplgfxgcyc.supabase.co/storage/v1/object/public/kyc/certificates/${knowledge.id}/diploma.pdf`,
            status: DocumentVerificationStatus.VALIDATED,
            provider: 'GEMINI_AI',
            score: skill.score,
            reason: skill.reason,
          },
        });
      }
    }

    count++;
    console.log(`[${count}/10] Especialista creado: ${spec.name} (${spec.postalCode}) - Oficios: ${spec.skills.map(s => s.name).join(', ')}`);
  }

  console.log('\n--- Siembra completada con éxito: 10 Especialistas activos creados ---');
}

seed()
  .catch((e) => {
    console.error('Error durante la siembra:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
